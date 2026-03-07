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

  app.get("/api/chart/history", async (req, res) => {
    const symbol = (req.query.symbol as string) || "BTCUSDT";
    const interval = (req.query.interval as string) || "15m";
    const limit = (req.query.limit as string) || "500";

    const endpoints = [
      `https://api1.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`,
      `https://api2.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`,
      `https://api3.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`,
      `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`
    ];

    let lastError = null;
    let successfulData = null;

    for (const url of endpoints) {
      try {
        const response = await fetch(url);
        if (response.ok) {
          successfulData = await response.json();
          break;
        }
        lastError = `Binance API returned ${response.status}`;
      } catch (error: any) {
        lastError = error.message;
      }
    }

    if (successfulData && Array.isArray(successfulData)) {
      const cleanCandles = successfulData
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

      const uniqueCandles = [];
      const seen = new Set();
      for (const c of cleanCandles) {
        if (!seen.has(c.time)) {
          seen.add(c.time);
          uniqueCandles.push(c);
        }
      }
      return res.json(uniqueCandles);
    }

    // Mock data is ONLY available if explicitly enabled in environment
    // AND we are in development mode.
    if (process.env.NODE_ENV === "development" && process.env.ENABLE_MOCKS === "true") {
      console.warn("Binance blocked (451). Development mode: generating deterministic historical mock data.");
      
      const limitNum = parseInt(limit);
      const intervalMinutes = 15;
      const now = Math.floor(Date.now() / (intervalMinutes * 60 * 1000)) * (intervalMinutes * 60 * 1000);
      const basePrice = 68000;
      
      const mockHistory = Array.from({ length: limitNum }).map((_, i) => {
        const time = Math.floor((now - (limitNum - i) * intervalMinutes * 60 * 1000) / 1000);
        const seed = time;
        const rnd = (Math.sin(seed) + 1) / 2;
        const open = basePrice + Math.sin(time / 100000) * 2000 + (rnd - 0.5) * 100;
        const close = open + (rnd - 0.4) * 150;
        return {
          time,
          open,
          high: Math.max(open, close) + rnd * 50,
          low: Math.min(open, close) - rnd * 50,
          close,
          volume: 100 + rnd * 1000
        };
      });

      return res.json(mockHistory);
    }

    return res.status(503).json({
      error: "FAILED_TO_FETCH_HISTORY",
      details: lastError || "All mirror endpoints failed."
    });
  });

  return httpServer;
}
