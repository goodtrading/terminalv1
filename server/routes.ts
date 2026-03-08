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
import { getOrderBook } from "./services/orderbookService";
// Import the service to start the WebSocket connection
import "./services/orderbookService";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
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

  app.get("/api/scenarios", async (_req, res) => {
    const data = await storage.getTradingScenarios();
    res.json(data);
  });

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

    try {
      const candles = await MarketDataGateway.getCandles(symbol, interval, limit);
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
    try {
      const ticker = await MarketDataGateway.getTicker(symbol);
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

    try {
      const candles = await MarketDataGateway.getCandles(symbol, interval, limit);
      res.json(candles);
    } catch (error: any) {
      res.status(503).json({
        error: "FAILED_TO_FETCH_HISTORY",
        details: error.message
      });
    }
  });

  return httpServer;
}
