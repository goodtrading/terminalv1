/**
 * GoodTrading AI chat route — FASE AI-1 (Mentor + mock).
 * Legacy OpenAI payload path kept for compatibility when body is not schemaVersion 1.0.
 * Legacy market helpers are loaded lazily so Mentor tests/runtime avoid live market side effects.
 */
import type { Express, Request, Response } from "express";
import { z } from "zod";
import {
  isGoodTradingAiV1Request,
  SAFE_AI_ERROR_MESSAGES,
} from "@shared/goodTradingAi";
import { requireSaasAuth } from "../middleware/saasAuth";
import { GoodTradingAIError, toAiErrorBody } from "../ai/goodTradingAi/errors";
import { isGoodTradingAiEnabled } from "../ai/goodTradingAi/features";
import { goodTradingAIService } from "../ai/goodTradingAi/service";
import { aiChatRateLimit } from "../ai/goodTradingAi/rateLimit";

const legacyAiChatSchema = z.object({
  message: z.string().trim().min(1).max(4000),
  includeLiveContext: z.boolean().optional().default(true),
  marketContext: z.any().optional(),
});

export function registerAiChatRoutes(app: Express): void {
  app.post(
    "/api/ai/chat",
    requireSaasAuth,
    aiChatRateLimit,
    async (req: Request, res: Response) => {
      // AI-1 structured path — no live market imports on this branch.
      if (isGoodTradingAiV1Request(req.body)) {
        try {
          const ac = new AbortController();
          const onClose = () => {
            if (!res.writableEnded) ac.abort();
          };
          req.on("close", onClose);
          try {
            const result = await goodTradingAIService.handleChat(req.body, {
              signal: ac.signal,
            });
            return res.json(result);
          } finally {
            req.off("close", onClose);
          }
        } catch (err) {
          if (err instanceof GoodTradingAIError) {
            return res.status(err.httpStatus).json(toAiErrorBody(err));
          }
          console.error("[GoodTradingAI] unexpected error");
          return res.status(502).json({
            code: "PROVIDER_ERROR",
            error: "PROVIDER_ERROR",
            message: SAFE_AI_ERROR_MESSAGES.PROVIDER_ERROR,
          });
        }
      }

      // Legacy OpenAI path (compatibility). Not used by Mentor UI.
      try {
        const parsed = legacyAiChatSchema.safeParse(req.body ?? {});
        if (!parsed.success) {
          return res.status(400).json({
            code: "INVALID_REQUEST",
            error: "INVALID_REQUEST",
            message: SAFE_AI_ERROR_MESSAGES.INVALID_REQUEST,
          });
        }

        // If experimental AI is enabled, do not serve live-market legacy analysis
        // from this panel path — force clients onto Mentor contracts.
        if (isGoodTradingAiEnabled()) {
          return res.status(400).json({
            code: "INVALID_REQUEST",
            error: "INVALID_REQUEST",
            message:
              "Usá schemaVersion 1.0 y mode mentor. El análisis con mercado en vivo no está disponible en AI-1.",
          });
        }

        const { message, includeLiveContext, marketContext } = parsed.data;

        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) {
          return res.status(503).json({ error: "OPENAI_API_KEY_MISSING" });
        }

        let finalMarketContext: unknown = undefined;
        if (marketContext != null) {
          if (typeof marketContext === "object" && !Array.isArray(marketContext)) {
            const sizeBytes = Buffer.byteLength(JSON.stringify(marketContext), "utf8");
            if (sizeBytes <= 25_000) finalMarketContext = marketContext;
          } else {
            return res.status(400).json({ error: "INVALID_AI_REQUEST" });
          }
        }

        // Lazy-load only for legacy path so Mentor isolation stays clean.
        const { buildLiveMarketContext } = await import("../ai/buildLiveMarketContext");
        const { generateAIResponse } = await import("../lib/openaiClient");

        if (!finalMarketContext && includeLiveContext) {
          try {
            finalMarketContext = await buildLiveMarketContext();
          } catch {
            finalMarketContext = undefined;
          }
        }

        const responseText = await generateAIResponse({
          message,
          marketContext: finalMarketContext,
        });

        return res.json({ response: responseText });
      } catch (err: unknown) {
        const details =
          err instanceof Error ? err.message : String(err) || "Unknown backend error";
        if (err instanceof Error) console.error("AI_CHAT_ERROR:", err.message);
        return res.status(500).json({
          error: "AI_CHAT_ERROR",
          details: details || "Unknown backend error",
        });
      }
    },
  );
}
