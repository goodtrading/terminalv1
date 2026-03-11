import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { MarketDataGateway } from "./market-gateway";
import { getTerminalState } from "./terminal-state";
import { DeribitOptionsGateway } from "./deribit-gateway";
import { OrderBookGateway } from "./orderbook-gateway";
import { buildTaskPlan } from "./ai/task-agent";
import { z } from "zod";
import { processVacuumDetection, type VacuumEvent, type VacuumState } from "./engine/liquidityVacuum";
import { getOrderBook, initializeFullDepth } from "./services/orderbookService";
import { getKrakenOrderBook } from "./kraken-gateway";
import { liquidityVacuumEngine, VacuumEngineInput } from "./lib/liquidityVacuumEngine";
import { VacuumValidationTests } from "./lib/vacuumValidationTests";
import { scenarioEngine, TerminalSignals } from "./lib/scenarioEngine";
import { testScenarioEngine } from "./lib/scenarioEngineTest";

// Initialize full depth on server start
initializeFullDepth().catch(console.error);

// NOTE: Tests removed from auto-execution to prevent startup blocking
// Use /api/vacuum/test and /api/scenarios/test endpoints for manual testing

// Import the service to start the WebSocket connection
import "./services/orderbookService";

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
      const orderBook = getOrderBook();
      res.json({
        exchange: "binance",
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

  // --- New Terminal Aggregation Endpoint ---
  app.get("/api/terminal/state", async (_req, res) => {
    try {
      const state = await getTerminalState();
      res.json(state);
    } catch (error: any) {
      res.status(500).json({ error: "TERMINAL_STATE_UNAVAILABLE", details: error.message });
    }
  });

  // Existing analytics endpoints
  app.get("/api/market-state", async (_req, res) => {
    const data = await storage.getMarketState();
    res.json(data);
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
      
      console.debug("[API] Orderbook request:", {
        bidCount: orderbook.bids.length,
        askCount: orderbook.asks.length,
        hasTimestamp: !!orderbook.timestamp,
        topBid: orderbook.bids[0],
        topAsk: orderbook.asks[0],
        totalBids: orderbook.bids.reduce((sum, b) => sum + b.size, 0),
        totalAsks: orderbook.asks.reduce((sum, a) => sum + a.size, 0)
      });
      
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
    console.log("Structural Scenario Engine responding");
    
    try {
      // Get all required terminal signals with timeout protection
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Timeout')), 2000)
      );

      const [terminalState, positioning, vacuumData] = await Promise.all([
        getTerminalState().catch(() => null),
        storage.getOptionsPositioning().catch(() => null),
        Promise.race([
          fetch('http://localhost:3000/api/vacuum').then(r => r.json()).catch(() => null),
          timeoutPromise
        ]).catch(() => null)
      ]);

      // DEBUG: Log raw data sources
      console.log("=== SCENARIOS API DEBUG ===");
      console.log("TERMINAL STATE:", {
        hasMarket: !!terminalState?.market,
        gammaRegime: terminalState?.market?.gammaRegime,
        gammaFlip: terminalState?.market?.gammaFlip,
        hasLevels: !!terminalState?.levels,
        gammaMagnets: terminalState?.levels?.gammaMagnets,
        pressure: (terminalState as any)?.positioning_engines?.liquidityHeatmap?.liquidityPressure
      });
      console.log("POSITIONING:", {
        callWall: positioning?.callWall,
        putWall: positioning?.putWall
      });
      console.log("VACUUM DATA:", {
        vacuumRisk: vacuumData?.vacuumRisk,
        vacuumType: vacuumData?.vacuumType,
        vacuumDirection: vacuumData?.vacuumDirection,
        vacuumProximity: vacuumData?.vacuumProximity,
        nearestZone: vacuumData?.nearestThinLiquidityZone
      });

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

      console.log("FINAL SIGNALS FOR ENGINE:", signals);

      // Generate scenarios with safe fallback
      const scenarios = scenarioEngine.generateScenarios(signals);
      
      console.log("GENERATED SCENARIOS:", scenarios);
      console.log("=== END SCENARIOS API DEBUG ===");

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

  return httpServer;
}
