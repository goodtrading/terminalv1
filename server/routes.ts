import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { MarketDataGateway } from "./market-gateway";
import { getTerminalState } from "./terminal-state";
import { DeribitOptionsGateway } from "./deribit-gateway";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // --- Deribit Options Gateway Endpoints ---
  app.get("/api/options/raw", async (_req, res) => {
    try {
      const data = await DeribitOptionsGateway.ingestLatestCSV();
      res.json(data);
    } catch (e: any) {
      res.status(500).json({ error: "INGESTION_FAILED", details: e.message });
    }
  });

  app.get("/api/options/summary", async (_req, res) => {
    try {
      const data = await DeribitOptionsGateway.ingestLatestCSV();
      const ticker = await MarketDataGateway.getCachedTicker();
      const summary = await DeribitOptionsGateway.getSummary(data, ticker?.price);
      res.json(summary);
    } catch (e: any) {
      res.status(500).json({ error: "SUMMARY_FAILED", details: e.message });
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
