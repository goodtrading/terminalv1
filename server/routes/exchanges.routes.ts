import type { Express, Request, Response } from "express";
import { getExchangeStatus } from "../services/execution/executionGateway";

export function registerExchangeRoutes(app: Express): void {
  app.get("/api/exchanges/status", (_req: Request, res: Response) => {
    try {
      res.json(getExchangeStatus());
    } catch (error: unknown) {
      console.error("[API] /api/exchanges/status error:", error);
      res.status(500).json({ error: "Failed to fetch exchange status" });
    }
  });
}
