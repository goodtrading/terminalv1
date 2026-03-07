import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
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

  app.get("/api/chart/candles", async (req, res) => {
    try {
      const symbol = (req.query.symbol as string) || "BTCUSDT";
      const interval = (req.query.interval as string) || "15m";
      const limit = (req.query.limit as string) || "500";

      const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
      const response = await fetch(url);
      
      if (!response.ok) {
        return res.status(response.status).json({ 
          error: "FAILED_TO_FETCH_BINANCE", 
          details: `Binance API returned ${response.status}` 
        });
      }
      
      const rawData = await response.json();
      if (!Array.isArray(rawData)) {
        return res.status(500).json({ error: "INVALID_BINANCE_RESPONSE" });
      }

      const cleanCandles = rawData
        .filter((k: any[]) => Array.isArray(k) && k.length >= 5)
        .map((k: any[]) => ({
          time: Math.floor(Number(k[0]) / 1000),
          open: parseFloat(k[1]),
          high: parseFloat(k[2]),
          low: parseFloat(k[3]),
          close: parseFloat(k[4]),
          volume: parseFloat(k[5])
        }))
        .filter((c: any) =>
          Number.isFinite(c.time) &&
          Number.isFinite(c.open) &&
          Number.isFinite(c.high) &&
          Number.isFinite(c.low) &&
          Number.isFinite(c.close)
        )
        .sort((a: any, b: any) => a.time - b.time);

      // Deduplicate
      const uniqueCandles = [];
      const seen = new Set();
      for (const c of cleanCandles) {
        if (!seen.has(c.time)) {
          seen.add(c.time);
          uniqueCandles.push(c);
        }
      }

      res.json(uniqueCandles);
    } catch (error) {
      console.error("Chart data error:", error);
      res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
    }
  });

  return httpServer;
}
