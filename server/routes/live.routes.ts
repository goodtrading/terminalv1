import { Router, type Express, type Request, type Response } from "express";
import { requireSaasAuth } from "../middleware/saasAuth";
import { requireBingxTerminalPlan } from "../middleware/bingxTerminalGuard";
import { bingxRateLimit } from "../middleware/bingxRateLimit";
import { getLiveTradingReadiness } from "../services/execution/liveTradingReadinessService";
import { previewBingXLiveOrder } from "../services/execution/liveOrderPreviewService";
import type { LiveOrderPreviewRequest } from "../services/execution/liveOrderPreviewTypes";
import { submitBingXLiveLimitOrder } from "../services/execution/liveOrderSubmitService";
import { parseLiveOrderSubmitBody } from "../services/execution/liveOrderSubmitParse";
import { emitLiveReadinessFailed } from "../services/system/liveReadinessAudits";
import { isDryRunEnabled } from "../services/execution/riskGuard";
import { getBingXSymbolRules, clearSymbolRulesCache } from "../services/exchanges/bingx/bingxSymbolRulesService";

const LIVE_ROUTES_LOG = "[live-routes]";

function resolveUserId(req: Request): number | null {
  const raw = req.saasUser?.id ?? req.user?.id;
  if (raw == null) return null;
  const id = Number(raw);
  return Number.isFinite(id) ? id : null;
}

function jsonResponse(res: Response, status: number, body: Record<string, unknown>): void {
  res.status(status).type("application/json").json(body);
}

export const liveApiRouter = Router();

liveApiRouter.get(
  "/readiness",
  requireSaasAuth,
  requireBingxTerminalPlan,
  bingxRateLimit({ scope: "live.readiness", max: 30, windowMs: 60_000 }),
  async (req: Request, res: Response) => {
  try {
    const userId = resolveUserId(req);
    if (userId == null) {
      return jsonResponse(res, 401, {
        success: false,
        code: "UNAUTHORIZED",
        message: "Authentication required.",
      });
    }

    const exchange =
      typeof req.query.exchange === "string" && req.query.exchange.trim()
        ? req.query.exchange.trim().toLowerCase()
        : "bingx";

    const readiness = await getLiveTradingReadiness(userId, exchange);

    jsonResponse(res, 200, { success: true, readiness });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Readiness check failed";
    console.error(`${LIVE_ROUTES_LOG} GET /readiness error:`, message);

    const userId = resolveUserId(req);
    if (userId != null) {
      void emitLiveReadinessFailed(userId, "bingx", message);
    }

    jsonResponse(res, 500, {
      success: false,
      code: "LIVE_READINESS_FAILED",
      message: "Failed to evaluate live trading readiness.",
    });
  }
});

liveApiRouter.post(
  "/order-preview",
  requireSaasAuth,
  requireBingxTerminalPlan,
  bingxRateLimit({ scope: "live.preview", max: 10, windowMs: 60_000 }),
  async (req: Request, res: Response) => {
    console.log(`${LIVE_ROUTES_LOG} POST /api/live/order-preview hit`);
    try {
      const userId = resolveUserId(req);
      if (userId == null) {
        return jsonResponse(res, 401, {
          success: false,
          code: "UNAUTHORIZED",
          message: "Authentication required.",
        });
      }

      const body = req.body as Record<string, unknown> | undefined;
      if (body?.mode === "live" || body?.submit === true || body?.execute === true) {
        return jsonResponse(res, 403, {
          success: false,
          code: "LIVE_EXECUTION_FORBIDDEN",
          message: "Live order execution is not allowed on this endpoint.",
        });
      }

      if (!isDryRunEnabled()) {
        return jsonResponse(res, 403, {
          success: false,
          code: "DRY_RUN_DISABLED",
          message: "Live order dry-run preview is disabled.",
        });
      }

      const request = parseLiveOrderPreviewBody(body);
      if (!request.ok) {
        return jsonResponse(res, 400, {
          success: false,
          code: "INVALID_LIVE_ORDER_PREVIEW_REQUEST",
          message: request.message,
        });
      }

      const preview = await previewBingXLiveOrder(userId, request.data);

      jsonResponse(res, 200, { success: true, preview });
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Preview failed";
      console.error(`${LIVE_ROUTES_LOG} POST /order-preview error:`, message);
      jsonResponse(res, 500, {
        success: false,
        code: "LIVE_ORDER_PREVIEW_FAILED",
        message: "Failed to build live order preview.",
      });
    }
  },
);

liveApiRouter.post(
  "/order-submit",
  requireSaasAuth,
  requireBingxTerminalPlan,
  bingxRateLimit({ scope: "live.submit", max: 2, windowMs: 60_000 }),
  async (req: Request, res: Response) => {
    console.log(`${LIVE_ROUTES_LOG} POST /api/live/order-submit hit`);
    try {
      const userId = resolveUserId(req);
      if (userId == null) {
        return jsonResponse(res, 401, {
          success: false,
          code: "UNAUTHORIZED",
          message: "Authentication required.",
        });
      }

      const body = req.body as Record<string, unknown> | undefined;
      if (body?.mode === "dry_run") {
        return jsonResponse(res, 403, {
          success: false,
          code: "DRY_RUN_FORBIDDEN",
          message: "Dry-run mode is not allowed on the live submit endpoint.",
        });
      }

      const parsed = parseLiveOrderSubmitBody(body);
      if (!parsed.ok) {
        return jsonResponse(res, 400, {
          success: false,
          code: "INVALID_LIVE_ORDER_SUBMIT_REQUEST",
          message: parsed.message,
        });
      }

      const result = await submitBingXLiveLimitOrder(userId, parsed.data);

      jsonResponse(res, 200, { success: true, result });
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Live submit failed";
      console.error(`${LIVE_ROUTES_LOG} POST /order-submit error:`, message);
      jsonResponse(res, 500, {
        success: false,
        code: "LIVE_ORDER_SUBMIT_FAILED",
        message: "Failed to submit live limit order.",
      });
    }
  },
);

liveApiRouter.get(
  "/symbol-rules",
  requireSaasAuth,
  requireBingxTerminalPlan,
  bingxRateLimit({ scope: "live.symbol-rules", max: 30, windowMs: 60_000 }),
  async (req: Request, res: Response) => {
    try {
      const userId = resolveUserId(req);
      if (userId == null) {
        return jsonResponse(res, 401, {
          success: false,
          code: "UNAUTHORIZED",
          message: "Authentication required.",
        });
      }

      const exchange = typeof req.query.exchange === "string" ? req.query.exchange.trim().toLowerCase() : "bingx";
      if (exchange !== "bingx") {
        return jsonResponse(res, 400, {
          success: false,
          code: "INVALID_EXCHANGE",
          message: 'exchange must be "bingx".',
        });
      }

      const symbol = typeof req.query.symbol === "string" ? req.query.symbol.trim() : "";
      if (!symbol) {
        return jsonResponse(res, 400, {
          success: false,
          code: "INVALID_SYMBOL",
          message: "symbol is required.",
        });
      }

      const forceRefresh = req.query.refresh === "true";
      if (forceRefresh) {
        clearSymbolRulesCache();
      }

      const rules = await getBingXSymbolRules(symbol);

      jsonResponse(res, 200, {
        success: true,
        exchange: "bingx",
        symbol,
        rules,
        cached: !forceRefresh,
      });
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Failed to fetch symbol rules";
      console.error(`${LIVE_ROUTES_LOG} GET /symbol-rules error:`, message);
      jsonResponse(res, 500, {
        success: false,
        code: "SYMBOL_RULES_FETCH_FAILED",
        message,
      });
    }
  },
);

let liveRoutesMounted = false;

/** Mount GET/POST /api/live/* — safe to call once. */
export function registerLiveRoutes(app: Express): void {
  if (liveRoutesMounted) return;
  liveRoutesMounted = true;

  app.use("/api/live", liveApiRouter);
  console.log(
    `${LIVE_ROUTES_LOG} mounted GET /api/live/readiness, POST /api/live/order-preview, POST /api/live/order-submit, GET /api/live/symbol-rules`,
  );
}

function parseLiveOrderPreviewBody(
  body: Record<string, unknown> | undefined,
):
  | { ok: true; data: LiveOrderPreviewRequest }
  | { ok: false; message: string } {
  if (!body || typeof body !== "object") {
    return { ok: false, message: "Request body is required." };
  }

  const exchange = body.exchange === "bingx" ? "bingx" : null;
  if (!exchange) {
    return { ok: false, message: 'exchange must be "bingx".' };
  }

  const symbol = typeof body.symbol === "string" ? body.symbol.trim() : "";
  if (!symbol) return { ok: false, message: "symbol is required." };

  const side = body.side === "buy" || body.side === "sell" ? body.side : null;
  if (!side) return { ok: false, message: 'side must be "buy" or "sell".' };

  const type =
    body.type === "market" || body.type === "limit" ? body.type : null;
  if (!type) return { ok: false, message: 'type must be "market" or "limit".' };

  const num = (k: string) => {
    const v = body[k];
    if (v == null || v === "") return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  };

  const source =
    body.source === "manual" ||
    body.source === "paper_mirror" ||
    body.source === "risk_panel"
      ? body.source
      : "manual";

  const leverageRaw = num("leverage");
  if (leverageRaw != null && leverageRaw <= 0) {
    return { ok: false, message: "leverage must be > 0." };
  }

  const sizingMode = body.sizingMode === "margin" || body.sizingMode === "notional" ? body.sizingMode : undefined;

  return {
    ok: true,
    data: {
      exchange: "bingx",
      symbol,
      side,
      type,
      quantity: num("quantity"),
      notionalUsdt: num("notionalUsdt"),
      marginUsdt: num("marginUsdt"),
      sizingMode,
      limitPrice: num("limitPrice"),
      stopLossPrice: num("stopLossPrice"),
      takeProfitPrice: num("takeProfitPrice"),
      leverage: leverageRaw,
      reduceOnly: body.reduceOnly === true,
      source,
    },
  };
}
