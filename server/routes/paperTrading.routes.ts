import { Router, type Request, type Response } from "express";
import { requirePaperUserId } from "../middleware/paperAuth";
import { requireSaasAuth } from "../middleware/saasAuth";
import {
  normalizePaperOrderBody,
  paperExecutionAdapter,
} from "../services/paperExecutionAdapter";
import { getPaperTerminalExecutionContext } from "@shared/execution/paperExecutionContext";
import {
  getPaperFills,
  getPaperLogs,
  getPaperSettings,
  getPaperTradeById,
  getPaperTradeLedger,
  killSwitchPaper,
  partialClosePaperPosition,
  resetPaperAccount,
  resetPaperEngine,
  runPaperStopCheck,
  submitPaperOrder,
  updatePaperOrder,
  updatePaperPositionRisk,
  updatePaperTradeMetadata,
} from "../services/paperTrading/paperExecutionEngine";
import { buildPaperFillsCsv, buildPaperTradesCsv } from "../services/paperTrading/paperExport";
import {
  normalizeOrderBody,
  normalizeSettingsPatch,
  normalizeTradeMetadataPatch,
} from "../services/paperTrading/paperNormalize";
import { runWithPaperUser, runWithPaperUserAsync } from "../services/paperTrading/paperUserContext";
import { updatePaperSettings } from "../services/paperTrading/paperStore";
import type { ResetPaperAccountOptions } from "../services/paperTrading/paperTypes";
import { emitAuditEvent } from "../services/system/auditLogService";

export const paperTradingRouter = Router();

paperTradingRouter.use(requireSaasAuth);

function withPaperUser(
  handler: (req: Request, res: Response, userId: number) => void | Promise<void>,
) {
  return (req: Request, res: Response) => {
    const userId = requirePaperUserId(req, res);
    if (userId == null) return;
    return runWithPaperUserAsync(userId, () => Promise.resolve(handler(req, res, userId)));
  };
}

paperTradingRouter.get("/context", (_req, res) => {
  res.json({ success: true, context: getPaperTerminalExecutionContext() });
});

function savePaperSettingsHandler(req: Request, res: Response): void {
  const userId = requirePaperUserId(req, res);
  if (userId == null) return;
  runWithPaperUser(userId, () => {
    try {
      const validated = normalizeSettingsPatch(req.body ?? {});
      if (!validated.ok) {
        res.status(400).json({
          success: false,
          code: validated.code,
          message: validated.message,
        });
        return;
      }
      const settings = updatePaperSettings(validated.patch);
      res.json({ success: true, settings });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error("[paper-settings] save failed", message);
      res.status(500).json({
        success: false,
        code: "PAPER_SETTINGS_SAVE_FAILED",
        message: "Unable to save paper settings.",
      });
    }
  });
}

paperTradingRouter.get("/settings", withPaperUser((_req, res) => {
  res.json(getPaperSettings());
}));

paperTradingRouter.patch("/settings", savePaperSettingsHandler);
paperTradingRouter.post("/settings", savePaperSettingsHandler);

paperTradingRouter.post("/reset-account", withPaperUser((req, res) => {
  try {
    const body = (req.body ?? {}) as ResetPaperAccountOptions;
    const state = resetPaperAccount(body);
    res.json({ success: true, state });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[paper-settings] reset-account failed", message);
    res.status(500).json({ success: false, message: "Unable to reset paper account." });
  }
}));

paperTradingRouter.get("/account", withPaperUser(async (_req, res, userId) => {
  const data = await paperExecutionAdapter.getAccount(userId);
  res.json({
    exchange: "paper",
    ...data,
  });
}));

paperTradingRouter.get("/orders", withPaperUser(async (_req, res, userId) => {
  const orders = await paperExecutionAdapter.getOrders(userId);
  res.json({ orders });
}));

paperTradingRouter.get("/positions", withPaperUser(async (_req, res, userId) => {
  const positions = await paperExecutionAdapter.getPositions(userId);
  res.json({ positions });
}));

paperTradingRouter.get("/position", withPaperUser(async (_req, res, userId) => {
  const positions = await paperExecutionAdapter.getPositions(userId);
  res.json({ position: positions[0] ?? null });
}));

paperTradingRouter.patch("/position/risk", withPaperUser((req, res) => {
  try {
    const body = (req.body ?? {}) as { stopLoss?: number | null; takeProfit?: number | null };
    const result = updatePaperPositionRisk(body);
    if (!result.success) {
      res.status(400).json({
        success: false,
        code: result.code,
        message: result.message,
      });
      return;
    }
    res.json({
      success: true,
      position: result.position,
      trade: result.trade,
      message: result.message,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Risk update failed";
    console.error("[paper-execution] position/risk failed", message);
    res.status(500).json({ success: false, message });
  }
}));

paperTradingRouter.get("/logs", withPaperUser((_req, res) => {
  res.json({ logs: getPaperLogs() });
}));

paperTradingRouter.get("/fills", withPaperUser((_req, res) => {
  res.json({ fills: getPaperFills() });
}));

paperTradingRouter.get("/trades", withPaperUser((_req, res) => {
  res.json({ trades: getPaperTradeLedger() });
}));

paperTradingRouter.get("/trades/export.csv", withPaperUser((_req, res) => {
  const csv = buildPaperTradesCsv();
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="paper-trades.csv"');
  res.send(csv);
}));

paperTradingRouter.get("/fills/export.csv", withPaperUser((_req, res) => {
  const csv = buildPaperFillsCsv();
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="paper-fills.csv"');
  res.send(csv);
}));

paperTradingRouter.get("/trades/:id", withPaperUser((req, res) => {
  const trade = getPaperTradeById(req.params.id);
  if (!trade) {
    res.status(404).json({ success: false, message: "Trade not found" });
    return;
  }
  res.json({ trade });
}));

paperTradingRouter.patch("/trades/:id", withPaperUser((req, res) => {
  const validated = normalizeTradeMetadataPatch((req.body ?? {}) as Record<string, unknown>);
  if (!validated.ok) {
    res.status(400).json({ success: false, message: validated.message });
    return;
  }
  const trade = updatePaperTradeMetadata(req.params.id, validated.patch);
  if (!trade) {
    res.status(404).json({ success: false, message: "Trade not found" });
    return;
  }
  res.json({ success: true, trade });
}));

paperTradingRouter.post("/check-stops", withPaperUser(async (_req, res) => {
  try {
    res.json(await runPaperStopCheck());
  } catch (err) {
    const message = err instanceof Error ? err.message : "Stop check failed";
    console.error("[paper-execution] check-stops failed", message);
    res.status(500).json({ success: false, message });
  }
}));

paperTradingRouter.post("/preview", withPaperUser(async (req, res, userId) => {
  try {
    const normalized = normalizePaperOrderBody((req.body ?? {}) as Record<string, unknown>);
    if ("error" in normalized) {
      res.status(400).json({
        success: false,
        code: normalized.code,
        message: normalized.error,
      });
      return;
    }
    const result = await paperExecutionAdapter.previewOrder(userId, normalized);
    if (!result.success) {
      res.status(400).json(result);
      return;
    }
    res.json({ success: true, preview: result.data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Preview failed";
    console.error("[paper-execution] preview failed", message);
    res.status(500).json({ success: false, message });
  }
}));

async function handlePaperOrderSubmit(req: Request, res: Response, userId: number) {
  console.log("[paper] received", { userId, path: "/api/paper/order" });
  const normalized = normalizePaperOrderBody((req.body ?? {}) as Record<string, unknown>);
  if ("error" in normalized) {
    console.warn("[paper] failed", {
      code: normalized.code,
      message: normalized.error,
    });
    res.status(400).json({
      success: false,
      code: normalized.code,
      message: normalized.error,
    });
    return;
  }
  console.log("[paper] normalized intent", {
    userId,
    symbol: normalized.symbol,
    side: normalized.side,
    orderType: normalized.orderType,
  });
  const result = await paperExecutionAdapter.submitOrder(userId, normalized);
  if (!result.success) {
    console.warn("[paper] failed", {
      code: result.code,
      message: result.message,
    });
    res.status(400).json(result);
    return;
  }
  console.log("[paper] success", { userId, symbol: normalized.symbol });
  void emitAuditEvent({
    userId,
    type: "paper_order_submitted",
    severity: "info",
    message: result.data.message ?? "Paper order submitted",
    metadata: {
      exchange: "paper",
      symbol: normalized.symbol,
      side: normalized.side,
      type: normalized.orderType,
      notionalUsdt: normalized.notionalUSDT,
      quantity: normalized.qty,
      paper: true,
    },
  });
  res.json({
    success: true,
    ...result.data,
    message: result.data.message ?? "Paper order submitted",
  });
}

paperTradingRouter.post("/order", withPaperUser(handlePaperOrderSubmit));
paperTradingRouter.post("/submit", withPaperUser(async (req, res, userId) => {
  try {
    console.log("[paper] received", { userId, path: "/api/paper/submit" });
    const body = normalizeOrderBody((req.body ?? {}) as Record<string, unknown>);
    console.log("[paper] normalized intent", {
      userId,
      symbol: body.symbol,
      side: body.side,
      type: body.type,
    });
    const result = await submitPaperOrder(body);
    if (!result.success) {
      console.warn("[paper] failed", {
        code: result.code,
        message: result.error ?? result.message,
      });
      res.status(400).json({
        success: false,
        code: result.code ?? "PAPER_ORDER_REJECTED",
        message: result.error ?? result.message ?? "Paper order rejected",
      });
      return;
    }
    console.log("[paper] fill applied", { userId });
    console.log("[paper] success", { userId });
    void emitAuditEvent({
      userId,
      type: "paper_order_submitted",
      severity: "info",
      message: result.message ?? "Paper order submitted",
      metadata: {
        exchange: "paper",
        symbol: body.symbol,
        side: body.side,
        orderType: body.type,
        size: body.size,
        sizeUnit: body.sizeUnit,
        paper: true,
      },
    });
    res.json({
      success: true,
      order: result.order,
      account: result.account,
      position: result.position,
      message: result.message ?? "Paper order submitted",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Submit failed";
    console.error("[paper] failed", { code: "PAPER_SUBMIT_FAILED", message });
    res.status(500).json({ success: false, code: "PAPER_SUBMIT_FAILED", message });
  }
}));

paperTradingRouter.patch("/orders/:id", withPaperUser((req, res) => {
  try {
    const body = (req.body ?? {}) as { price?: number };
    const result = updatePaperOrder(req.params.id, { price: body.price });
    if (!result.success) {
      res.status(400).json({
        success: false,
        code: result.code,
        message: result.message,
      });
      return;
    }
    res.json({ success: true, order: result.order, message: result.message });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Order update failed";
    console.error("[paper-execution] order patch failed", message);
    res.status(500).json({ success: false, message });
  }
}));

paperTradingRouter.post("/orders/:id/cancel", withPaperUser(async (req, res, userId) => {
  const result = await paperExecutionAdapter.cancelOrder(userId, req.params.id);
  if (!result.success) {
    res.status(404).json(result);
    return;
  }
  void emitAuditEvent({
    userId,
    type: "paper_order_cancelled",
    severity: "info",
    message: result.data.message ?? "Paper order cancelled",
    metadata: {
      exchange: "paper",
      orderId: req.params.id,
      paper: true,
    },
  });
  res.json({ success: true, message: result.data.message });
}));

paperTradingRouter.post("/cancel-order", withPaperUser(async (req, res, userId) => {
  const orderId = String((req.body as { orderId?: string })?.orderId ?? "");
  if (!orderId) {
    res.status(400).json({ success: false, message: "orderId is required" });
    return;
  }
  const result = await paperExecutionAdapter.cancelOrder(userId, orderId);
  if (!result.success) {
    res.status(404).json(result);
    return;
  }
  void emitAuditEvent({
    userId,
    type: "paper_order_cancelled",
    severity: "info",
    message: result.data.message ?? "Paper order cancelled",
    metadata: { exchange: "paper", orderId, paper: true },
  });
  res.json({ success: true, message: result.data.message });
}));

paperTradingRouter.post("/cancel-all", withPaperUser(async (_req, res, userId) => {
  const result = await paperExecutionAdapter.cancelAllOrders(userId);
  res.json({ success: true, cancelled: result.data.cancelled });
}));

paperTradingRouter.post("/position/close-partial", withPaperUser(async (req, res, userId) => {
  try {
    const percent = Number((req.body as { percent?: number })?.percent);
    const result = await partialClosePaperPosition(percent);
    if (!result.success) {
      res.status(400).json({
        success: false,
        code: result.code,
        message: result.message,
      });
      return;
    }
    void emitAuditEvent({
      userId,
      type: "paper_partial_close",
      severity: "info",
      message: result.message ?? "Paper position partially closed",
      metadata: {
        exchange: "paper",
        percent,
        paper: true,
      },
    });
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Partial close failed";
    console.error("[paper-execution] close-partial failed", message);
    res.status(500).json({ success: false, code: "PARTIAL_CLOSE_FAILED", message });
  }
}));

paperTradingRouter.post("/close-position", withPaperUser(async (_req, res, userId) => {
  const result = await paperExecutionAdapter.closePosition(userId);
  if (!result.success) {
    res.status(400).json(result);
    return;
  }
  void emitAuditEvent({
    userId,
    type: "paper_position_closed",
    severity: "info",
    message: "Paper position closed",
    metadata: { exchange: "paper", paper: true },
  });
  res.json(result.data);
}));

paperTradingRouter.post("/kill-switch", withPaperUser(async (_req, res) => {
  try {
    res.json(await killSwitchPaper());
  } catch (err) {
    const message = err instanceof Error ? err.message : "Kill switch failed";
    console.error("[paper-execution] kill-switch failed", message);
    res.status(500).json({ success: false, message });
  }
}));

paperTradingRouter.post("/reset", withPaperUser((_req, res) => {
  try {
    const state = resetPaperEngine();
    res.json({ success: true, state });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Reset failed";
    console.error("[paper-settings] full reset failed", message);
    res.status(500).json({ success: false, message });
  }
}));
