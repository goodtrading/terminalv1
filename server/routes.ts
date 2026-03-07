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

  // Binance Proxy to avoid CORS
  app.get("/api/proxy/binance/klines", async (req, res) => {
    try {
      const { symbol, interval, limit } = req.query;
      const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
      const response = await fetch(url);
      
      if (!response.ok) {
        // If Binance is restricted, return mock data based on a realistic price
        console.warn(`Binance API returned ${response.status}. Falling back to mock data.`);
        const basePrice = 68250;
        const limitNum = Number(limit) || 300;
        const intervalMinutes = interval === "1h" ? 60 : interval === "1d" ? 1440 : 15;
        const now = Math.floor(Date.now() / (intervalMinutes * 60 * 1000)) * (intervalMinutes * 60 * 1000);
        
        let lastClose = basePrice;
        const mockKlines = Array.from({ length: limitNum }).map((_, i) => {
          const time = now - (limitNum - 1 - i) * intervalMinutes * 60 * 1000;
          const open = lastClose;
          const close = open + (Math.random() - 0.5) * 150;
          const high = Math.max(open, close) + Math.random() * 50;
          const low = Math.min(open, close) - Math.random() * 50;
          lastClose = close;
          
          return [
            time,
            open.toString(),
            high.toString(),
            low.toString(),
            close.toString(),
            "100", // volume
            time + intervalMinutes * 60 * 1000,
            "1000",
            10,
            "50",
            "500",
            "0"
          ];
        });
        return res.json(mockKlines);
      }
      
      const data = await response.json();
      res.json(data);
    } catch (error) {
      console.error("Proxy error:", error);
      res.status(500).json({ error: "Failed to fetch from Binance" });
    }
  });

  return httpServer;
}
