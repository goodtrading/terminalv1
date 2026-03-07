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
      const data = await response.json();
      res.json(data);
    } catch (error) {
      console.error("Proxy error:", error);
      res.status(500).json({ error: "Failed to fetch from Binance" });
    }
  });

  return httpServer;
}
