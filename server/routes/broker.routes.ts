import type { Express, Request, Response } from "express";
import {
  getBingxLoginStatus,
  handleBingxBrokerCallback,
} from "../services/broker/bingxBrokerLoginService";

export function registerBrokerRoutes(app: Express): void {
  app.get("/api/broker/bingx/login-status", (_req: Request, res: Response) => {
    try {
      res.json(getBingxLoginStatus());
    } catch (error: unknown) {
      console.error("[API] /api/broker/bingx/login-status error:", error);
      res.status(500).json({ error: "Failed to fetch BingX broker login status" });
    }
  });

  /**
   * Placeholder for official BingX broker login callback.
   * No token processing implemented yet.
   */
  app.get("/api/broker/bingx/callback", (req: Request, res: Response) => {
    try {
      const result = handleBingxBrokerCallback(
        req.query as Record<string, string | string[] | undefined>,
      );

      if (!result.success) {
        return res.status(400).json({
          success: false,
          code: result.code ?? "BROKER_CALLBACK_NOT_CONFIGURED",
          message: result.message,
        });
      }

      if (result.redirectUrl && req.accepts("html")) {
        return res.redirect(302, result.redirectUrl);
      }

      res.json({
        success: true,
        code: "BROKER_CALLBACK_RECEIVED",
        message: result.message,
        redirectUrl: result.redirectUrl ?? null,
      });
    } catch (error: unknown) {
      console.error("[API] /api/broker/bingx/callback error:", error);
      res.status(500).json({ error: "Broker callback handler failed" });
    }
  });
}
