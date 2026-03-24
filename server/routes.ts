import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { MarketDataGateway } from "./market-gateway";
import { getTerminalState } from "./terminal-state";
import { DeribitOptionsGateway } from "./deribit-gateway";
import { OrderBookGateway } from "./orderbook-gateway";
import { buildTaskPlan } from "./ai/task-agent";
import { buildLiveMarketContext } from "./ai/buildLiveMarketContext";
import { generateAIResponse } from "./lib/openaiClient";
import { z } from "zod";
import { processVacuumDetection, type VacuumEvent, type VacuumState } from "./engine/liquidityVacuum";
import { getOrderBook, initializeFullDepth } from "./services/orderbookService";
import { getKrakenOrderBook } from "./kraken-gateway";
import { liquidityVacuumEngine, VacuumEngineInput } from "./lib/liquidityVacuumEngine";
import { VacuumValidationTests } from "./lib/vacuumValidationTests";
import { scenarioEngine, TerminalSignals } from "./lib/scenarioEngine";
import { testScenarioEngine } from "./lib/scenarioEngineTest";

// Debug flags to prevent event-loop blocking from log spam.
// Keep these false by default; enable locally when diagnosing.
const DEBUG_TERMINAL_STATE = false;
const DEBUG_ORDERBOOK = false;
const DEBUG_VACUUM = false;
const DEBUG_SCENARIOS = false;

// Very small TTL caches for expensive endpoints that are polled frequently.
// These are intentionally short and conservative to avoid stale decisions.
let vacuumCache: { ts: number; value: any } = { ts: 0, value: null };
let scenariosCache: { ts: number; value: any } = { ts: 0, value: null };
let terminalStateCache: { ts: number; value: any } = { ts: 0, value: null };
const VACUUM_CACHE_TTL_MS = 1500;
const SCENARIOS_CACHE_TTL_MS = 1500;
const TERMINAL_STATE_CACHE_TTL_MS = 1500;

// Initialize full depth on server start
initializeFullDepth().catch(console.error);

// NOTE: Tests removed from auto-execution to prevent startup blocking
// Use /api/vacuum/test and /api/scenarios/test endpoints for manual testing

// Import the service to start the WebSocket connection
import "./services/orderbookService";
import { startOptionsRefreshInterval } from "./options-engine";

startOptionsRefreshInterval();

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // --- Raw Order Book Endpoint (unified shape: exchange, bids, asks, timestamp) ---
  app.get("/api/orderbook/raw", async (req: Request, res: Response) => {
    const source = (req.query.source as string)?.toLowerCase();
    const symbol = (req.query.symbol as string) || "BTCUSDT";
    try {
      if (source === "kraken") {
        const ob = await getKrakenOrderBook(symbol, 500);
        res.json({
          exchange: "kraken",
          bids: ob.bids.map((level) => [level.price.toString(), level.size.toString()]),
          asks: ob.asks.map((level) => [level.price.toString(), level.size.toString()]),
          timestamp: ob.timestamp,
        });
        return;
      }
      let orderBook = getOrderBook();
      let exchange = "binance";
      if (orderBook.bids.length === 0 && orderBook.asks.length === 0) {
        const ob = await getKrakenOrderBook(symbol, 500);
        orderBook = {
          bids: ob.bids.map((b) => ({ price: b.price, size: b.size })),
          asks: ob.asks.map((a) => ({ price: a.price, size: a.size })),
          timestamp: ob.timestamp,
        };
        exchange = "kraken";
        if (process.env.NODE_ENV === "production") {
          console.warn("[API] /api/orderbook/raw: WS empty, fallback to Kraken");
        }
      }
      res.json({
        exchange,
        bids: orderBook.bids.map((level) => [level.price.toString(), level.size.toString()]),
        asks: orderBook.asks.map((level) => [level.price.toString(), level.size.toString()]),
        timestamp: orderBook.timestamp || Date.now(),
      });
    } catch (error: any) {
      console.error("[API] Order book fetch error:", error?.message ?? error);
      res.status(500).json({ error: "Failed to fetch order book" });
    }
  });

  // --- Deribit Options Gateway Endpoints ---
  app.get("/api/options/raw", async (_req, res) => {
    try {
      const { options, source } = await DeribitOptionsGateway.ingestOptions();
      res.json({ options, source });
    } catch (e: any) {
      res.status(500).json({ error: "INGESTION_FAILED", details: e.message });
    }
  });

  app.get("/api/options/summary", async (_req, res) => {
    try {
      const { options, source } = await DeribitOptionsGateway.ingestOptions();
      const ticker = await MarketDataGateway.getCachedTicker();
      const summary = await DeribitOptionsGateway.getSummary(options, ticker?.price, source);
      res.json(summary);
    } catch (e: any) {
      res.status(500).json({ error: "SUMMARY_FAILED", details: e.message });
    }
  });

  // ---- AI DEV AGENT (localhost only) ----
  app.post("/api/ai/task-agent", async (req: Request, res: Response) => {
    try {
      const host = req.hostname;

      if (host !== "localhost" && host !== "127.0.0.1") {
        return res.status(403).json({ error: "AI agent disabled in production" });
      }

      const { goal } = req.body ?? {};

      if (!goal || typeof goal !== "string") {
        return res.status(400).json({ error: "Missing goal" });
      }

      const plan = buildTaskPlan({ goal });

      res.json(plan);
    } catch (err: any) {
      console.error("AI task-agent error:", err);
      res.status(500).json({ error: "AI agent failure" });
    }
  });

  app.post("/api/ai/chat", async (req: Request, res: Response) => {
    const aiChatSchema = z.object({
      message: z.string().trim().min(1).max(4000),
      includeLiveContext: z.boolean().optional().default(true),
      marketContext: z.any().optional(),
    });

    try {
      const parsed = aiChatSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({ error: "INVALID_AI_REQUEST" });
      }

      const { message, includeLiveContext, marketContext } = parsed.data;

      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        return res.status(503).json({ error: "OPENAI_API_KEY_MISSING" });
      }

      let finalMarketContext: any = undefined;
      if (marketContext != null) {
        if (typeof marketContext === "object" && !Array.isArray(marketContext)) {
          // Guard against accidental huge payloads.
          const sizeBytes = Buffer.byteLength(JSON.stringify(marketContext), "utf8");
          if (sizeBytes <= 25_000) finalMarketContext = marketContext;
        } else {
          return res.status(400).json({ error: "INVALID_AI_REQUEST" });
        }
      }

      if (!finalMarketContext && includeLiveContext) {
        try {
          finalMarketContext = await buildLiveMarketContext();
        } catch (ctxErr: any) {
          finalMarketContext = undefined;
        }
      }

      const responseText = await generateAIResponse({
        message,
        marketContext: finalMarketContext,
      });

      return res.json({ response: responseText });
    } catch (err: any) {
      // Produce structured error payload with exact failure cause.
      if (err) console.error("AI_CHAT_ERROR:", err.message ?? String(err));
      const details = err?.message || String(err) || "Unknown backend error";

      return res.status(500).json({
        error: "AI_CHAT_ERROR",
        details: details || "Unknown backend error",
      });
    }
  });

  // --- New Terminal Aggregation Endpoint ---
  app.get("/api/terminal/state", async (_req, res) => {
    try {
      const now = Date.now();
      if (terminalStateCache.value && now - terminalStateCache.ts < TERMINAL_STATE_CACHE_TTL_MS) {
        return res.json(terminalStateCache.value);
      }

      const state = await getTerminalState();
      const hasPositioning = state != null && "positioning" in state;
      const hasAbsorption = hasPositioning && state.positioning != null && typeof (state.positioning as any).absorption === "object";
      const opts = (state as any)?.options;
      const gm = (state as any)?.gravityMap;
      if (DEBUG_TERMINAL_STATE) {
        console.log("[API terminal/state]", {
          hasMarket: !!state?.market,
          gammaRegime: state?.market?.gammaRegime,
          hasOptions: !!opts,
          gravityMapStatus: gm?.status ?? null,
        });
      }
      terminalStateCache = { ts: now, value: state };
      res.json(state);
    } catch (error: any) {
      res.status(500).json({ error: "TERMINAL_STATE_UNAVAILABLE", details: error.message });
    }
  });

  // Existing analytics endpoints
  app.get("/api/market-state", async (_req, res) => {
    const data = await storage.getMarketState();
    const optionsLastUpdated = storage.getOptionsLastUpdated();
    res.json({ ...data, optionsLastUpdated });
  });

  app.get("/api/dealer-exposure", async (_req, res) => {
    const data = await storage.getDealerExposure();
    res.json(data);
  });

  app.get("/api/options-positioning", async (_req, res) => {
    const data = await storage.getOptionsPositioning();
    res.json(data);
  });

  app.get("/api/key-levels", async (_req, res) => {
    const data = await storage.getKeyLevels();
    res.json(data);
  });

  // Old scenarios endpoint removed - replaced by structural scenarios endpoint below

  app.get("/api/dealer-hedging-flow", async (_req, res) => {
    const data = await storage.getDealerHedgingFlow();
    res.json(data);
  });

  app.get("/api/orderbook", async (_req, res) => {
    try {
      const orderbook = getOrderBook();
      
      if (DEBUG_ORDERBOOK) {
        console.debug("[API] Orderbook request:", {
          bidCount: orderbook.bids.length,
          askCount: orderbook.asks.length,
          hasTimestamp: !!orderbook.timestamp,
          topBid: orderbook.bids[0],
          topAsk: orderbook.asks[0],
        });
      }
      
      res.json(orderbook);
    } catch (error) {
      console.error("[API] Orderbook fetch error:", error);
      res.status(500).json({ error: "Failed to fetch orderbook data" });
    }
  });

  app.get("/api/orderbook/status", async (_req, res) => {
    try {
      const orderbook = getOrderBook();
      const isConnected = orderbook.timestamp && (Date.now() - orderbook.timestamp) < 5000; // Connected if data within 5 seconds
      
      res.json({
        connected: isConnected,
        bidCount: orderbook.bids.length,
        askCount: orderbook.asks.length,
        lastUpdate: orderbook.timestamp,
        age: orderbook.timestamp ? Date.now() - orderbook.timestamp : null
      });
    } catch (error) {
      console.error("[API] Orderbook status error:", error);
      res.status(500).json({ error: "Failed to get orderbook status" });
    }
  });

  // --- New Market Data Gateway Endpoints ---

  app.get("/api/market/candles", async (req, res) => {
    const symbol = (req.query.symbol as string) || "BTCUSDT";
    const interval = (req.query.interval as string) || "15m";
    const limit = parseInt(req.query.limit as string) || 500;
    const source = req.query.source as string | undefined;

    try {
      const candles = await MarketDataGateway.getCandles(symbol, interval, limit, source);
      res.json(candles);
    } catch (error: any) {
      console.error(`[Gateway] Candle Fetch Error: ${error.message}`);
      res.status(503).json({
        error: "MARKET_DATA_UNAVAILABLE",
        details: error.message
      });
    }
  });

  app.get("/api/market/ticker", async (req, res) => {
    const symbol = (req.query.symbol as string) || "BTCUSDT";
    const source = req.query.source as string | undefined;
    try {
      const ticker = await MarketDataGateway.getTicker(symbol, source);
      res.json(ticker);
    } catch (error: any) {
      console.error(`[Gateway] Ticker Fetch Error: ${error.message}`);
      res.status(503).json({
        error: "MARKET_DATA_UNAVAILABLE",
        details: error.message
      });
    }
  });

  app.get("/api/liquidity/heatmap", async (_req, res) => {
    try {
      const ticker = MarketDataGateway.getCachedTicker();
      const spotPrice = ticker?.price;
      if (!spotPrice) {
        res.status(503).json({ error: "SPOT_PRICE_UNAVAILABLE" });
        return;
      }
      const heatmap = await OrderBookGateway.getLiquidityHeatmap(spotPrice);
      res.json(heatmap);
    } catch (e: any) {
      res.status(500).json({ error: "HEATMAP_FAILED", details: e.message });
    }
  });

  // Legacy route redirect for terminal compatibility during transition
  app.get("/api/chart/history", async (req, res) => {
    const symbol = (req.query.symbol as string) || "BTCUSDT";
    const interval = (req.query.interval as string) || "15m";
    const limit = parseInt(req.query.limit as string) || 500;
    const source = req.query.source as string | undefined;

    try {
      const candles = await MarketDataGateway.getCandles(symbol, interval, limit, source);
      res.json(candles);
    } catch (error: any) {
      res.status(503).json({
        error: "FAILED_TO_FETCH_HISTORY",
        details: error.message
      });
    }
  });

  // --- Liquidity Vacuum Analysis Endpoint ---
  app.get("/api/vacuum", async (req: Request, res: Response) => {
    try {
      const now = Date.now();
      if (vacuumCache.value && now - vacuumCache.ts < VACUUM_CACHE_TTL_MS) {
        return res.json(vacuumCache.value);
      }

      // Get current market data
      const [orderBook, terminalState, positioning] = await Promise.all([
        getOrderBook(),
        getTerminalState(),
        storage.getOptionsPositioning()
      ]);

      if (!orderBook || !orderBook.bids.length || !orderBook.asks.length) {
        return res.status(503).json({
          error: "Insufficient orderbook data for vacuum analysis",
          vacuumRisk: "LOW",
          vacuumDirection: "NEUTRAL",
          confirmedVacuumActive: false
        });
      }

      // Calculate spot price from orderbook
      const bestBid = orderBook.bids[0]?.price || 0;
      const bestAsk = orderBook.asks[0]?.price || 0;
      const spotPrice = bestBid && bestAsk ? (bestBid + bestAsk) / 2 : bestBid || bestAsk;

      if (!spotPrice) {
        return res.status(503).json({
          error: "Unable to determine spot price",
          vacuumRisk: "LOW",
          vacuumDirection: "NEUTRAL",
          confirmedVacuumActive: false
        });
      }

      // Prepare input for vacuum engine
      const input: VacuumEngineInput = {
        spotPrice,
        bids: orderBook.bids.map(bid => ({ price: bid.price, size: bid.size })),
        asks: orderBook.asks.map(ask => ({ price: ask.price, size: ask.size })),
        nearestBookClusters: positioning ? {
          above: [positioning.callWall].filter(Boolean),
          below: [positioning.putWall].filter(Boolean)
        } : undefined,
        spread: bestAsk - bestBid,
        liquiditySweepRisk: terminalState?.market?.liquiditySweepDetector,
        dealerHedgingFlow: terminalState?.market?.dealerHedgingFlow,
        volatility: terminalState?.market?.distanceToFlip ? Math.abs(terminalState.market.distanceToFlip) : undefined
      };

      // Run vacuum analysis
      const result = liquidityVacuumEngine.analyze(input);
      vacuumCache = { ts: now, value: result };
      res.json(result);
    } catch (error) {
      console.error("Vacuum analysis error:", error);
      res.status(500).json({
        error: "Failed to analyze vacuum conditions",
        vacuumRisk: "LOW",
        vacuumDirection: "NEUTRAL",
        confirmedVacuumActive: false
      });
    }
  });

  // --- Validation Test Endpoint ---
  app.get("/api/vacuum/test", async (req: Request, res: Response) => {
    try {
      console.log("🧪 Manual validation test triggered via API");
      await VacuumValidationTests.runAllTests();
      res.json({ message: "Validation tests completed - check server logs for results" });
    } catch (error) {
      console.error("Validation test error:", error);
      res.status(500).json({ error: "Validation tests failed" });
    }
  });

  // --- Scenario Test Endpoint ---
  app.get("/api/scenarios/test", async (req: Request, res: Response) => {
    try {
      console.log("🧪 Manual scenario test triggered via API");
      testScenarioEngine();
      res.json({ message: "Scenario tests completed - check server logs for results" });
    } catch (error) {
      console.error("Scenario test error:", error);
      res.status(500).json({ error: "Scenario tests failed" });
    }
  });

  // --- Structural Scenarios Endpoint ---
  app.get("/api/scenarios", async (req: Request, res: Response) => {
    try {
      const now = Date.now();
      if (scenariosCache.value && now - scenariosCache.ts < SCENARIOS_CACHE_TTL_MS) {
        return res.json(scenariosCache.value);
      }

      if (DEBUG_SCENARIOS) {
        console.log("Structural Scenario Engine responding");
      }

      // Get all required terminal signals with timeout protection
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Timeout')), 2000)
      );

      const port = process.env.PORT || "5000";
      const vacuumUrl = `http://localhost:${port}/api/vacuum`;

      const [terminalState, positioning, vacuumData] = await Promise.all([
        getTerminalState().catch(() => null),
        storage.getOptionsPositioning().catch(() => null),
        Promise.race([
          fetch(vacuumUrl).then(r => r.json()).catch(() => null),
          timeoutPromise
        ]).catch(() => null)
      ]);

      if (DEBUG_SCENARIOS) {
        console.log("=== SCENARIOS API DEBUG ===");
        console.log("TERMINAL STATE:", {
          hasMarket: !!terminalState?.market,
          gammaRegime: terminalState?.market?.gammaRegime,
          gammaFlip: terminalState?.market?.gammaFlip,
          hasLevels: !!terminalState?.levels,
        });
        console.log("POSITIONING:", { callWall: positioning?.callWall, putWall: positioning?.putWall });
        console.log("VACUUM DATA:", {
          vacuumRisk: vacuumData?.vacuumRisk,
          vacuumType: vacuumData?.vacuumType,
          vacuumDirection: vacuumData?.vacuumDirection,
          vacuumProximity: vacuumData?.vacuumProximity,
        });
      }

      // Extract signals for scenario engine with safe fallbacks
      const signals: TerminalSignals = {
        gammaRegime: terminalState?.market?.gammaRegime || "LONG", // Safe fallback
        gammaFlip: terminalState?.market?.gammaFlip || undefined,
        gammaMagnets: terminalState?.levels?.gammaMagnets || [],
        callWall: positioning?.callWall || undefined,
        putWall: positioning?.putWall || undefined,
        pressure: (terminalState as any)?.positioning_engines?.liquidityHeatmap?.liquidityPressure || "BALANCED", // Safe fallback
        vacuumRisk: vacuumData?.vacuumRisk || "LOW", // Safe fallback
        vacuumType: vacuumData?.vacuumType || "NONE", // Safe fallback
        vacuumDirection: vacuumData?.vacuumDirection || "NEUTRAL", // Safe fallback
        vacuumProximity: vacuumData?.vacuumProximity || "FAR", // Safe fallback
        thinLiquidity: vacuumData?.nearestThinLiquidityZone ? {
          price: vacuumData.nearestThinLiquidityZone,
          direction: vacuumData.nearestThinLiquidityDirection || "NONE"
        } : undefined
      };

      if (DEBUG_SCENARIOS) {
        console.log("FINAL SIGNALS FOR ENGINE:", {
          gammaRegime: signals.gammaRegime,
          gammaFlip: signals.gammaFlip,
          magnetsCount: signals.gammaMagnets?.length ?? 0,
        });
      }

      // Generate scenarios with safe fallback
      const scenarios = scenarioEngine.generateScenarios(signals);
      
      if (DEBUG_SCENARIOS) {
        console.log("GENERATED SCENARIOS:", scenarios);
        console.log("=== END SCENARIOS API DEBUG ===");
      }

      scenariosCache = { ts: now, value: scenarios };

      res.json(scenarios);
    } catch (error) {
      console.error("Scenario generation error:", error);
      // Safe fallback with consistent shape
      const fallbackScenarios = {
        marketRegime: "UNKNOWN",
        baseCase: { probability: 60, title: "Analysis Unavailable", summary: "Scenario engine temporarily unavailable", regime: "Unknown", trigger: "N/A", target: "N/A", bias: "NEUTRAL" as const },
        altCase: { probability: 25, title: "Analysis Unavailable", summary: "Scenario engine temporarily unavailable", regime: "Unknown", trigger: "N/A", target: "N/A", bias: "NEUTRAL" as const },
        volCase: { probability: 15, title: "Analysis Unavailable", summary: "Scenario engine temporarily unavailable", regime: "Unknown", trigger: "N/A", target: "N/A", bias: "NEUTRAL" as const }
      };
      res.status(500).json(fallbackScenarios);
    }
  });

  if (process.env.DATABASE_URL) {
    try {
      const { registerSaasRoutes } = await import("./routes/saasRoutes");
      registerSaasRoutes(app);
      const { startExpireSubscriptionsJob } = await import("./jobs/expireSubscriptions");
      startExpireSubscriptionsJob();
    } catch (e) {
      console.error("[SaaS] Failed to register SaaS routes:", e);
    }
  } else {
    console.error(
      "[SaaS] DATABASE_URL is not set. SaaS/auth is OFF: no DB connection. " +
        "Add DATABASE_URL to .env, run npm run db:push, then restart.",
    );
    const saasNotConfigured = (_req: Request, res: Response) => {
      res.status(503).json({
        error: "SAAS_NOT_CONFIGURED",
        message:
          "Set DATABASE_URL in .env, run npm run db:push, and restart the server.",
        saasDisabled: true,
      });
    };
    // GET: frontend needs JSON + saasDisabled (not HTML from Vite catch-all)
    app.get("/api/auth/me", (_req, res) => {
      res.json({ user: null, access: null, saasDisabled: true });
    });
    app.get("/api/plans", (_req, res) => {
      res.json({ plans: [], saasDisabled: true });
    });
    // Mutations / protected reads: explicit 503 JSON (otherwise Vite returns index.html)
    app.post("/api/auth/login", saasNotConfigured);
    app.post("/api/auth/register", saasNotConfigured);
    app.post("/api/auth/logout", (_req, res) => res.json({ ok: true }));
    app.get("/api/auth/access", saasNotConfigured);
    app.post("/api/payments/report", saasNotConfigured);
    app.get("/api/admin/users", saasNotConfigured);
    app.patch("/api/admin/users/:id", saasNotConfigured);
    app.post("/api/admin/users/:id/approve-to-pay", saasNotConfigured);
    app.post("/api/admin/users/:id/activate-access", saasNotConfigured);
    app.post("/api/admin/users/:id/subscription", saasNotConfigured);
    app.post("/api/admin/users/:id/subscription/deactivate", saasNotConfigured);
  }

  return httpServer;
}
