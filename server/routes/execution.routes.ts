import type { Express, Request, Response } from "express";
import {
  getExecutionStatus,
  killSwitch,
  previewOrder,
  submitOrder,
} from "../services/execution/executionGateway";
import type { OrderIntent } from "../services/execution/executionTypes";

export function registerExecutionRoutes(app: Express): void {
  app.get("/api/execution/status", (_req: Request, res: Response) => {
    try {
      res.json(getExecutionStatus());
    } catch (error: unknown) {
      console.error("[API] /api/execution/status error:", error);
      res.status(500).json({ error: "Failed to fetch execution status" });
    }
  });

  app.post("/api/execution/preview", (req: Request, res: Response) => {
    try {
      const body = req.body as Partial<OrderIntent>;
      const result = previewOrder(body);
      if (!result.success) {
        res.status(400).json({ success: false, errors: result.errors });
        return;
      }
      res.json({ success: true, preview: result.preview });
    } catch (error: unknown) {
      console.error("[API] /api/execution/preview error:", error);
      res.status(500).json({ error: "Failed to preview order" });
    }
  });

  app.post("/api/execution/submit", (req: Request, res: Response) => {
    try {
      const body = req.body as Partial<OrderIntent>;
      const result = submitOrder(body);
      res.status(403).json(result);
    } catch (error: unknown) {
      console.error("[API] /api/execution/submit error:", error);
      res.status(500).json({ error: "Failed to submit order" });
    }
  });

  app.post("/api/execution/kill-switch", (_req: Request, res: Response) => {
    try {
      const result = killSwitch();
      res.status(403).json(result);
    } catch (error: unknown) {
      console.error("[API] /api/execution/kill-switch error:", error);
      res.status(500).json({ error: "Failed to execute kill switch" });
    }
  });
}
