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
import { initializePerpFullDepth } from "./services/orderbookServicePerp";
import { getBookmapEngine, logBookmapMarketStateDiagnostics } from "./services/bookmapEngine";
import { getOrderBookForMarket, parseBookmapMarket } from "./services/orderbookMarketRegistry";
import { queryBboHistory } from "./services/bboHistoryRegistry";
import { getKrakenOrderBook } from "./kraken-gateway";
import { liquidityVacuumEngine, VacuumEngineInput } from "./lib/liquidityVacuumEngine";
import { VacuumValidationTests } from "./lib/vacuumValidationTests";
import { scenarioEngine, TerminalSignals } from "./lib/scenarioEngine";
import { testScenarioEngine } from "./lib/scenarioEngineTest";
import { resolveCandleLimit } from "@shared/candleLimits";

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

// Initialize full depth on server start (spot = legacy default; perp = futures leg)
initializeFullDepth().catch(console.error);
initializePerpFullDepth().catch(console.error);

// NOTE: Tests removed from auto-execution to prevent startup blocking
// Use /api/vacuum/test and /api/scenarios/test endpoints for manual testing

// Start spot + perp depth WebSocket feeds
import "./services/orderbookService";
import "./services/orderbookServicePerp";
import {
  queryBufferedAggTrades,
  subscribeAggTradeBuffer,
  trackAggTradeSseClient,
} from "./services/aggTradeBufferService";
import { startOptionsRefreshInterval } from "./options-engine";

startOptionsRefreshInterval();

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  const { registerDebugDbRoutes } = await import("./routes/debugDbRoutes");
  registerDebugDbRoutes(app);

  // --- Raw Order Book Endpoint (unified shape: exchange, bids, asks, timestamp) ---
  app.get("/api/orderbook/raw", async (req: Request, res: Response) => {
    const source = (req.query.source as string)?.toLowerCase();
    const symbol = (req.query.symbol as string) || "BTCUSDT";
    const market = parseBookmapMarket(req.query.market);
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
      let orderBook = getOrderBookForMarket(market);
      let exchange = market === "perp" ? "binance-perp" : "binance";
      if (orderBook.bids.length === 0 && orderBook.asks.length === 0 && market !== "perp") {
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
        market,
        bids: orderBook.bids.map((level) => [level.price.toString(), level.size.toString()]),
        asks: orderBook.asks.map((level) => [level.price.toString(), level.size.toString()]),
        timestamp: orderBook.timestamp || Date.now(),
      });
    } catch (error: any) {
      console.error("[API] Order book fetch error:", error?.message ?? error);
      res.status(500).json({ error: "Failed to fetch order book" });
    }
  });

  app.get("/api/bookmap/bbo-history", (req: Request, res: Response) => {
    const symbol = ((req.query.symbol as string) || "BTCUSDT").toUpperCase();
    const market = parseBookmapMarket(req.query.market);
    const startMs =
      req.query.startTime != null ? Number(req.query.startTime) : undefined;
    const endMs = req.query.endTime != null ? Number(req.query.endTime) : undefined;

    try {
      const raw = queryBboHistory(symbol, market, {
        startMs: Number.isFinite(startMs) ? startMs : undefined,
        endMs: Number.isFinite(endMs) ? endMs : undefined,
      });
      res.json({
        symbol,
        market,
        points: raw.map((p) => ({
          timestamp: p.timestamp,
          bestBid: p.bestBid,
          bestAsk: p.bestAsk,
        })),
        serverTime: Date.now(),
      });
    } catch (error: unknown) {
      console.error("[API] /api/bookmap/bbo-history error:", error);
      res.status(500).json({ error: "Failed to fetch BBO history" });
    }
  });

  app.get("/api/bookmap/state", async (req: Request, res: Response) => {
    const symbol = ((req.query.symbol as string) || "BTCUSDT").toUpperCase();
    const exchange = ((req.query.exchange as string) || "binance").toLowerCase();
    const market = parseBookmapMarket(req.query.market);
    const priceRangePct = req.query.priceRangePct
      ? Number(req.query.priceRangePct)
      : undefined;
    const bucketMs = req.query.bucketMs ? Number(req.query.bucketMs) : undefined;
    const minWallSize = req.query.minWallSize ? Number(req.query.minWallSize) : undefined;
    const includeStale = req.query.includeStale === "true" || req.query.includeStale === "1";
    const priceMin = req.query.priceMin != null ? Number(req.query.priceMin) : undefined;
    const priceMax = req.query.priceMax != null ? Number(req.query.priceMax) : undefined;

    try {
      const engine = getBookmapEngine(symbol, exchange, market);

      if (bucketMs != null && Number.isFinite(bucketMs) && bucketMs > 0) {
        engine.setBucketMs(bucketMs);
      }

      if (!engine.hasData()) {
        if (exchange === "kraken") {
          const ob = await getKrakenOrderBook(symbol, 500);
          engine.applySnapshot({
            bids: ob.bids.map((b) => ({ price: b.price, size: b.size })),
            asks: ob.asks.map((a) => ({ price: a.price, size: a.size })),
            timestamp: ob.timestamp,
          });
        } else if (exchange === "binance" || exchange.startsWith("binance")) {
          const orderBook = getOrderBookForMarket(market);
          if (orderBook.bids.length > 0 || orderBook.asks.length > 0) {
            engine.applySnapshot({
              bids: orderBook.bids,
              asks: orderBook.asks,
              timestamp: orderBook.timestamp ?? Date.now(),
            });
          }
        }
      }

      const state = engine.getCurrentState({
        priceRangePct,
        priceMin:
          priceMin != null && Number.isFinite(priceMin) ? priceMin : undefined,
        priceMax:
          priceMax != null && Number.isFinite(priceMax) ? priceMax : undefined,
        minWallSize,
        includeStale,
      });

      logBookmapMarketStateDiagnostics(symbol, exchange, market);

      res.json({
        symbol,
        exchange,
        market,
        ...state,
      });
    } catch (error: any) {
      console.error("[API] /api/bookmap/state error:", error?.message ?? error);
      res.status(500).json({ error: "Failed to fetch bookmap state" });
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
    if (!data) {
      return res.status(503).json({
        error: "MARKET_STATE_UNAVAILABLE",
        optionsLastUpdated: optionsLastUpdated ?? null,
      });
    }
    console.log("[GammaFlipTrace][Route:/api/market-state]", {
      gammaFlip: data?.gammaFlip ?? null,
      distanceToFlip: data?.distanceToFlip ?? null,
      transitionZoneStart: data?.transitionZoneStart ?? null,
      transitionZoneEnd: data?.transitionZoneEnd ?? null,
    });
    res.json({ ...data, optionsLastUpdated });
  });

  app.get("/api/dealer-exposure", async (_req, res) => {
    const data = await storage.getDealerExposure();
    if (!data) return res.status(503).json({ error: "DEALER_EXPOSURE_UNAVAILABLE" });
    res.json(data);
  });

  app.get("/api/options-positioning", async (_req, res) => {
    const data = await storage.getOptionsPositioning();
    if (!data) return res.status(503).json({ error: "OPTIONS_POSITIONING_UNAVAILABLE" });
    res.json(data);
  });

  app.get("/api/key-levels", async (_req, res) => {
    const data = await storage.getKeyLevels();
    if (!data) return res.status(503).json({ error: "KEY_LEVELS_UNAVAILABLE" });
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
    const limit = resolveCandleLimit(interval, req.query.limit);
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

  /** Aggregated trades for market data analysis (Binance aggTrades proxy). */
  app.get("/api/market/agg-trades", async (req, res) => {
    const rid = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const symbolRaw = (req.query.symbol as string) || "BTCUSDT";
    const symbol = symbolRaw.replace(/[^A-Za-z0-9]/g, "").toUpperCase() || "BTCUSDT";

    let startTime: number | undefined =
      req.query.startTime != null ? Number(req.query.startTime) : undefined;
    let endTime: number | undefined = req.query.endTime != null ? Number(req.query.endTime) : undefined;

    const limitRaw = req.query.limit != null ? Number(req.query.limit) : 5000;
    const limit = Number.isFinite(limitRaw) ? Math.min(5000, Math.max(1, limitRaw)) : 5000;
    const fullRange =
      String(req.query.fullRange ?? "").toLowerCase() === "1" ||
      String(req.query.fullRange ?? "").toLowerCase() === "true";

    const logCtx = () =>
      `[agg-trades ${rid}] symbol=${symbol} startMs=${startTime} endMs=${endTime} limit=${limit} fullRange=${fullRange ? 1 : 0}`;

    try {
      if (startTime != null && endTime != null) {
        if (!Number.isFinite(startTime) || !Number.isFinite(endTime)) {
          console.warn(`${logCtx()} invalid window (non-finite) → empty array`);
          return res.status(200).json([]);
        }
        if (startTime > endTime) {
          const tmp = startTime;
          startTime = endTime;
          endTime = tmp;
        }
        const now = Date.now();
        if (endTime > now) endTime = now;
        const MAX_SPAN_MS = 48 * 60 * 60 * 1000;
        if (endTime - startTime > MAX_SPAN_MS) {
          startTime = endTime - MAX_SPAN_MS;
        }
      }

      console.log(`${logCtx()} → gateway`);

      const market = parseBookmapMarket(req.query.market);
      const trades = await MarketDataGateway.getAggTrades(symbol, {
        startTimeMs: startTime != null && Number.isFinite(startTime) ? startTime : undefined,
        endTimeMs: endTime != null && Number.isFinite(endTime) ? endTime : undefined,
        limit,
        fullRange,
        market,
      });

      console.log(`${logCtx()} ← count=${Array.isArray(trades) ? trades.length : "not-array"}`);

      res.status(200).json(Array.isArray(trades) ? trades : []);
    } catch (error: any) {
      console.error(`${logCtx()} exception:`, error?.message ?? error, error?.stack);
      res.status(200).json([]);
    }
  });

  /** Real-time aggTrades stream (SSE) for live market data updates. */
  app.get("/api/market/agg-trades/stream", (req, res) => {
    const symbolRaw = (req.query.symbol as string) || "BTCUSDT";
    const symbol = symbolRaw.replace(/[^A-Za-z0-9]/g, "").toUpperCase() || "BTCUSDT";
    const market = parseBookmapMarket(req.query.market);
    const sinceRaw = req.query.since != null ? Number(req.query.since) : NaN;
    const since = Number.isFinite(sinceRaw) ? Math.floor(sinceRaw) : Date.now() - 2_000;

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders?.();

    const send = (t: any) => {
      res.write(`data: ${JSON.stringify(t)}\n\n`);
    };
    res.write(`event: ready\ndata: {"ok":true}\n\n`);

    const seed = queryBufferedAggTrades(symbol, since, Date.now(), market);
    for (const t of seed) send(t);

    trackAggTradeSseClient(market, 1);

    const unsubscribe = subscribeAggTradeBuffer(
      symbol,
      (trade) => {
        send(trade);
      },
      market,
    );

    const hb = setInterval(() => {
      res.write(`event: ping\ndata: {}\n\n`);
    }, 15_000);

    req.on("close", () => {
      clearInterval(hb);
      unsubscribe();
      trackAggTradeSseClient(market, -1);
    });
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
    const limit = resolveCandleLimit(interval, req.query.limit);
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
      console.log("[SaaS] DATABASE_URL present, registering SaaS routes...");
      const { registerSaasRoutes } = await import("./routes/saasRoutes");
      registerSaasRoutes(app);
      console.log("[SaaS] SaaS routes registered successfully");
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
      res.set({
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        Pragma: "no-cache",
        Expires: "0",
      });
      res.json({ authenticated: false, user: null, access: null, saasDisabled: true });
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
    app.get("/api/live/readiness", saasNotConfigured);
    app.post("/api/live/order-preview", saasNotConfigured);
  }

  // --- Deribit Options Ticker Enrichment Endpoint ---
  app.post("/api/options/deribit/tickers", async (req: Request, res: Response) => {
    console.log("[TICKER_ENRICHMENT_FETCH] Request received");
    
    try {
      // Validate body
      const { instrumentNames } = req.body;
      
      if (!Array.isArray(instrumentNames)) {
        return res.status(400).json({ error: "instrumentNames must be an array" });
      }
      
      if (instrumentNames.length === 0) {
        return res.json({ generatedAt: Date.now(), tickers: {}, errors: [] });
      }
      
      if (instrumentNames.length > 60) {
        return res.status(400).json({ error: "Maximum 60 instruments per request" });
      }
      
      // Filter and validate instrument names
      const validInstruments = [...new Set(instrumentNames)] // Remove duplicates
        .filter(name => typeof name === 'string' && name.length > 0)
        .filter(name => name.startsWith('BTC-') || name.startsWith('ETH-'))
        .slice(0, 60); // Safety limit
      
      if (validInstruments.length === 0) {
        return res.json({ generatedAt: Date.now(), tickers: {}, errors: [] });
      }
      
      console.log(`[TICKER_ENRICHMENT_FETCH] Processing ${validInstruments.length} instruments`);
      
      // Simple in-memory cache
      const CACHE_TTL_MS = 15000; // 15 seconds
      const tickerCache = new Map<string, { data: any; ts: number }>();
      
      const results: Record<string, any> = {};
      const errors: string[] = [];
      
      // Helper function to fetch single ticker with cache
      const fetchTickerWithCache = async (instrumentName: string): Promise<any> => {
        const cached = tickerCache.get(instrumentName);
        const now = Date.now();
        
        if (cached && (now - cached.ts) < CACHE_TTL_MS) {
          console.log(`[TICKER_ENRICHMENT_CACHE_HIT] ${instrumentName}`);
          return cached.data;
        }
        
        try {
          const response = await fetch(`https://www.deribit.com/api/v2/public/ticker?instrument_name=${encodeURIComponent(instrumentName)}`);
          
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }
          
          const data = await response.json();
          
          if (data.error) {
            throw new Error(data.error.message);
          }
          
          const ticker = data.result;
          
          // Cache the result
          tickerCache.set(instrumentName, { data: ticker, ts: now });
          
          return ticker;
        } catch (error) {
          console.error(`[TICKER_ENRICHMENT_ERROR] ${instrumentName}:`, error);
          throw error;
        }
      };
      
      // Helper function for defensive mapping
      const mapTickerData = (ticker: any) => {
        return {
          instrumentName: ticker.instrument_name,
          delta: ticker.greeks?.delta ?? ticker.delta ?? null,
          gamma: ticker.greeks?.gamma ?? null,
          vega: ticker.greeks?.vega ?? null,
          theta: ticker.greeks?.theta ?? null,
          bidIv: ticker.bid_iv ?? null,
          askIv: ticker.ask_iv ?? null,
          markIv: ticker.mark_iv ?? null,
          bidSize: ticker.best_bid_amount ?? ticker.bid_amount ?? ticker.bid_size ?? null,
          askSize: ticker.best_ask_amount ?? ticker.ask_amount ?? ticker.ask_size ?? null,
          markPrice: ticker.mark_price ?? null,
          underlyingPrice: ticker.underlying_price ?? ticker.index_price ?? null
        };
      };
      
      // Process with limited concurrency (batch of 5)
      const concurrency = 5;
      for (let i = 0; i < validInstruments.length; i += concurrency) {
        const batch = validInstruments.slice(i, i + concurrency);
        
        await Promise.allSettled(
          batch.map(async (instrumentName) => {
            try {
              const ticker = await fetchTickerWithCache(instrumentName);
              results[instrumentName] = mapTickerData(ticker);
            } catch (error) {
              errors.push(`${instrumentName}: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
          })
        );
      }
      
      console.log(`[TICKER_ENRICHMENT_OK] ${Object.keys(results).length} successful, ${errors.length} errors`);
      
      res.json({
        generatedAt: Date.now(),
        tickers: results,
        errors
      });
      
    } catch (error) {
      console.error('[TICKER_ENRICHMENT_ERROR] Unexpected error:', error);
      res.status(500).json({
        error: "Internal server error",
        generatedAt: Date.now(),
        tickers: {},
        errors: ["Internal server error"]
      });
    }
  });

  // --- Deribit Options Book Endpoint ---
  app.get("/api/options/deribit/book", async (req, res) => {
    console.log("[DERIBIT_OPTIONS_BOOK_FETCH] Request received");
    try {
      const currency = (req.query.currency as string)?.toUpperCase() || "BTC";
      const expiry = req.query.expiry as string | undefined;

      console.log("[DERIBIT_OPTIONS_DEBUG] incoming query", { currency, expiry });

      if (!["BTC", "ETH"].includes(currency)) {
        return res.status(400).json({
          error: "INVALID_CURRENCY",
          details: "Currency must be BTC or ETH"
        });
      }

      // Fetch instruments and book summary from Deribit API
      const [instrumentsResponse, summaryResponse] = await Promise.all([
        fetch(`https://www.deribit.com/api/v2/public/get_instruments?currency=${currency}&kind=option&expired=false`),
        fetch(`https://www.deribit.com/api/v2/public/get_book_summary_by_currency?currency=${currency}&kind=option`)
      ]);

      if (!instrumentsResponse.ok || !summaryResponse.ok) {
        throw new Error("Failed to fetch data from Deribit API");
      }

      const [instrumentsData, summaryData] = await Promise.all([
        instrumentsResponse.json(),
        summaryResponse.json()
      ]);

      if (instrumentsData.error || summaryData.error) {
        throw new Error(instrumentsData.error?.message || summaryData.error?.message || "Deribit API error");
      }

      const instruments = instrumentsData.result || [];
      const summaries = summaryData.result || [];

      console.log("[DERIBIT_OPTIONS_DEBUG] instruments count", instruments.length);
      console.log("[DERIBIT_OPTIONS_DEBUG] summaries count", summaries.length);

      // Get underlying price from Deribit index price API
      let underlyingPrice = null;
      try {
        const indexName = currency === "BTC" ? "btc_usd" : "eth_usd";
        console.log("[OPTIONS_UNDERLYING_DEBUG] fetching Deribit index price for", indexName);
        
        const indexResponse = await fetch(`https://www.deribit.com/api/v2/public/get_index_price?index_name=${indexName}`);
        const indexData = await indexResponse.json();
        
        if (indexData?.result?.index_price && Number.isFinite(indexData.result.index_price)) {
          underlyingPrice = indexData.result.index_price;
          console.log("[OPTIONS_UNDERLYING_DEBUG] Deribit index price found:", underlyingPrice);
        } else {
          console.log("[OPTIONS_UNDERLYING_DEBUG] Deribit index price response invalid:", indexData);
        }
      } catch (error) {
        console.log("[OPTIONS_UNDERLYING_DEBUG] Deribit index price API failed:", error);
      }

      // Helper function to normalize expiry formats
      const normalizeExpiry = (input: string | undefined | null): string | null => {
        if (!input) return null;
        
        // If already in Deribit format (DDMMMYY), return as-is
        if (/^\d{2}[A-Z]{3}\d{2}$/.test(input)) {
          return input;
        }
        
        // Convert YYYYMMDD format (20260428 -> 28APR26)
        if (/^\d{8}$/.test(input)) {
          const year = input.slice(2, 4);
          const monthMap: { [key: string]: string } = {
            '01': 'JAN', '02': 'FEB', '03': 'MAR', '04': 'APR',
            '05': 'MAY', '06': 'JUN', '07': 'JUL', '08': 'AUG',
            '09': 'SEP', '10': 'OCT', '11': 'NOV', '12': 'DEC'
          };
          const month = monthMap[input.slice(4, 6)];
          const day = input.slice(6, 8);
          return month ? `${day}${month}${year}` : null;
        }
        
        return null;
      };

      // Extract unique expiries from instruments in Deribit canonical format
      const expirySet = new Set<string>();
      instruments.forEach((i: any) => {
        const timestamp = i.expiration_timestamp;
        if (timestamp) {
          const date = new Date(timestamp);
          const day = date.getDate().toString().padStart(2, '0');
          const monthNames = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
          const month = monthNames[date.getMonth()];
          const year = date.getFullYear().toString().slice(2);
          const expiryDeribit = `${day}${month}${year}`;
          expirySet.add(expiryDeribit);
        }
      });
      
      const expiries = Array.from(expirySet).sort((a, b) => {
        // Sort by actual date, not alphabetically
        const dateA = new Date(
          2000 + parseInt(a.slice(4)), // year
          ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'].indexOf(a.slice(2, 5)), // month
          parseInt(a.slice(0, 2)) // day
        );
        const dateB = new Date(
          2000 + parseInt(b.slice(4)),
          ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'].indexOf(b.slice(2, 5)),
          parseInt(b.slice(0, 2))
        );
        return dateA.getTime() - dateB.getTime();
      });

      console.log("[DERIBIT_OPTIONS_DEBUG] available expiries", expiries);
      
      const normalizedRequestedExpiry = normalizeExpiry(expiry);
      console.log("[DERIBIT_OPTIONS_DEBUG] normalized requested expiry", { 
        original: expiry, 
        normalized: normalizedRequestedExpiry 
      });

      // Filter by selected expiry or use closest active expiry
      let selectedExpiry = normalizedRequestedExpiry;
      if (!selectedExpiry && expiries.length > 0) {
        selectedExpiry = expiries[0];
      }
      
      console.log("[DERIBIT_OPTIONS_DEBUG] selected expiry", selectedExpiry);

      // Parse instrument names and group by strike
      const strikeMap = new Map<number, { call?: any, put?: any }>();
      
      instruments.forEach((instrument: any) => {
        const match = instrument.instrument_name.match(/^(BTC|ETH)-(\d{2}[A-Z]{3}\d{2})-(\d+)-([CP])$/);
        if (match) {
          const [, , instrumentExpiry, strikeStr, optionType] = match;
          const strike = parseInt(strikeStr);
          
          if (!strikeMap.has(strike)) {
            strikeMap.set(strike, {});
          }
          
          const summary = summaries.find((s: any) => s.instrument_name === instrument.instrument_name);
          
          // Filter by selected expiry
          if (selectedExpiry && instrumentExpiry !== selectedExpiry) {
            return;
          }
          
          const optionData = {
            instrumentName: instrument.instrument_name,
            expiry: instrumentExpiry,
            strike: strikeStr,
            type: optionType,
            matchesSelectedExpiry: instrumentExpiry === selectedExpiry,
            openInterest: summary?.open_interest || null,
            delta: summary?.delta || null,
            bidIv: summary?.bid_iv || null,
            askIv: summary?.ask_iv || null,
            bidPrice: summary?.bid_price || null,
            askPrice: summary?.ask_price || null,
            bidSize: summary?.bid_amount || null,
            askSize: summary?.ask_amount || null,
            markPrice: summary?.mark_price || null,
            volume24h: summary?.volume_usd || null,
            priceChange24h: summary?.price_change_24h || null
          };
          
          if (optionType === 'C') {
            strikeMap.get(strike)!.call = optionData;
          } else if (optionType === 'P') {
            strikeMap.get(strike)!.put = optionData;
          }
        }
      });

      // Convert to sorted array
      const rows = Array.from(strikeMap.entries())
        .map(([strike, data]) => ({
          strike,
          call: data.call || null,
          put: data.put || null
        }))
        .sort((a, b) => a.strike - b.strike);

      console.log("[DERIBIT_OPTIONS_DEBUG] rows count", rows.length);
      console.log("[DERIBIT_OPTIONS_DEBUG] sample rows", rows.slice(0, 3).map(row => ({
        strike: row.strike,
        hasCall: !!row.call,
        hasPut: !!row.put,
        callOI: row.call?.openInterest,
        putOI: row.put?.openInterest
      })));

      console.log("[OPTIONS_UNDERLYING_DEBUG] final underlyingPrice:", underlyingPrice);

      const response = {
        currency: currency as "BTC" | "ETH",
        underlyingPrice,
        selectedExpiry: selectedExpiry || null,
        expiries,
        rows,
        generatedAt: Date.now()
      };

      console.log("[DERIBIT_OPTIONS_DEBUG] response summary", {
        currency,
        expiryCount: expiries.length,
        rowCount: rows.length,
        selectedExpiry,
        underlyingPrice
      });

      res.json(response);
    } catch (error: any) {
      console.error("[DERIBIT_OPTIONS_BOOK_ERROR]", error);
      res.status(500).json({
        error: "DERIBIT_BOOK_ERROR",
        details: error.message
      });
    }
  });

  const { registerExchangeRoutes } = await import("./routes/exchanges.routes");
  const { registerExecutionRoutes } = await import("./routes/execution.routes");
  const { registerBrokerRoutes } = await import("./routes/broker.routes");
  const { registerBingxApiRoutes } = await import("./routes/bingxApi.routes");
  const { registerSystemRoutes } = await import("./routes/system.routes");
  const { registerLiveRoutes } = await import("./routes/live.routes");
  const { registerRiskMirrorRoutes } = await import("./routes/riskMirror.routes");
  const { paperTradingRouter } = await import("./routes/paperTrading.routes");
  const { reportsRouter } = await import("./routes/reports.routes");
  registerExchangeRoutes(app);
  registerExecutionRoutes(app);
  registerBrokerRoutes(app);
  registerBingxApiRoutes(app);
  console.log("[routes] bingx read-only registered");
  registerSystemRoutes(app);
  registerLiveRoutes(app);
  console.log("[routes] system registered");
  console.log("[routes] live readiness registered");
  registerRiskMirrorRoutes(app);
  console.log("[routes] risk mirror registered");
  app.use("/api/paper", paperTradingRouter);
  app.use("/api/reports", reportsRouter);

  return httpServer;
}
