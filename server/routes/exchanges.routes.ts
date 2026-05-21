import type { Express, Request, Response } from "express";
import { optionalSaasAuth } from "../middleware/saasAuth";
import { getExchangeStatus } from "../services/execution/executionGateway";

export function registerExchangeRoutes(app: Express): void {
  app.get("/api/exchanges/status", optionalSaasAuth, (_req: Request, res: Response) => {
    try {
      res.json(getExchangeStatus(_req.saasUser?.id));
    } catch (error: unknown) {
      console.error("[API] /api/exchanges/status error:", error);
      res.status(500).json({ error: "Failed to fetch exchange status" });
    }
  });
}
