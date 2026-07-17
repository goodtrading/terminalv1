import type { Express, Request, Response } from "express";
import { requireSaasAuth } from "../middleware/saasAuth";
import { isAdminRole } from "../lib/userRoles";
import { isGoodTradingAiEnabled } from "../ai/goodTradingAi/features";
import { loadGoodTradingOpenAIConfig } from "../ai/goodTradingAi/openaiConfig";
import { getProviderHealthSnapshot } from "../ai/goodTradingAi/providerHealth";
import { randomUUID } from "node:crypto";

/**
 * Internal Mentors provider status — admin only, no paid OpenAI call, no secrets.
 */
export function registerAiProviderStatusRoutes(app: Express): void {
  app.get(
    "/api/internal/ai/provider/status",
    requireSaasAuth,
    (req: Request, res: Response) => {
      const requestId = (req.headers["x-request-id"] as string | undefined) || randomUUID();
      res.setHeader("x-request-id", requestId);

      const user = req.saasUser ?? req.user;
      if (!user) {
        res.status(401).json({ code: "UNAUTHENTICATED", message: "Authentication required.", requestId });
        return;
      }
      if (!isAdminRole(user.role)) {
        res.status(403).json({
          code: "FORBIDDEN",
          message: "Solo administradores internos.",
          requestId,
        });
        return;
      }

      const cfg = loadGoodTradingOpenAIConfig();
      const health = getProviderHealthSnapshot();

      res.json({
        enabled: isGoodTradingAiEnabled(),
        provider: cfg.provider,
        configured: cfg.provider === "mock" ? true : cfg.configured,
        model: cfg.provider === "openai" ? cfg.model : "mentor-knowledge-v2",
        lastSuccessAt: health.lastSuccessAt,
        lastErrorCategory: health.lastErrorCategory,
        // No key, raw errors, billing, or prompts.
      });
    },
  );
}
