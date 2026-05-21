import { Router } from "express";
import {
  cancelAllPaperOrders,
  cancelPaperOrder,
  closePaperPosition,
  partialClosePaperPosition,
  getPaperAccount,
  getPaperFills,
  getPaperLogs,
  getPaperOrders,
  getPaperPosition,
  getPaperSettings,
  getPaperTradeById,
  getPaperTradeLedger,
  killSwitchPaper,
  previewPaperOrder,
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
import { updatePaperSettings } from "../services/paperTrading/paperStore";
import type { ResetPaperAccountOptions } from "../services/paperTrading/paperTypes";

export const paperTradingRouter = Router();

function savePaperSettingsHandler(req: { body?: Record<string, unknown> }, res: {
  status: (code: number) => { json: (body: unknown) => void };
  json: (body: unknown) => void;
}): void {
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
}

paperTradingRouter.get("/settings", (_req, res) => {
  res.json(getPaperSettings());
});

paperTradingRouter.patch("/settings", savePaperSettingsHandler);
paperTradingRouter.post("/settings", savePaperSettingsHandler);

paperTradingRouter.post("/reset-account", (req, res) => {
  try {
    const body = (req.body ?? {}) as ResetPaperAccountOptions;
    const state = resetPaperAccount(body);
    res.json({ success: true, state });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[paper-settings] reset-account failed", message);
    res.status(500).json({ success: false, message: "Unable to reset paper account." });
  }
});

paperTradingRouter.get("/account", (_req, res) => {
  res.json(getPaperAccount());
});

paperTradingRouter.get("/orders", (_req, res) => {
  res.json({ orders: getPaperOrders() });
});

paperTradingRouter.get("/position", (_req, res) => {
  res.json({ position: getPaperPosition() });
});

paperTradingRouter.patch("/position/risk", (req, res) => {
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
});

paperTradingRouter.get("/logs", (_req, res) => {
  res.json({ logs: getPaperLogs() });
});

paperTradingRouter.get("/fills", (_req, res) => {
  res.json({ fills: getPaperFills() });
});

paperTradingRouter.get("/trades", (_req, res) => {
  res.json({ trades: getPaperTradeLedger() });
});

paperTradingRouter.get("/trades/export.csv", (_req, res) => {
  const csv = buildPaperTradesCsv();
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="paper-trades.csv"');
  res.send(csv);
});

paperTradingRouter.get("/fills/export.csv", (_req, res) => {
  const csv = buildPaperFillsCsv();
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="paper-fills.csv"');
  res.send(csv);
});

paperTradingRouter.get("/trades/:id", (req, res) => {
  const trade = getPaperTradeById(req.params.id);
  if (!trade) {
    res.status(404).json({ success: false, message: "Trade not found" });
    return;
  }
  res.json({ trade });
});

paperTradingRouter.patch("/trades/:id", (req, res) => {
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
});

paperTradingRouter.post("/check-stops", async (_req, res) => {
  try {
    res.json(await runPaperStopCheck());
  } catch (err) {
    const message = err instanceof Error ? err.message : "Stop check failed";
    console.error("[paper-execution] check-stops failed", message);
    res.status(500).json({ success: false, message });
  }
});

paperTradingRouter.post("/preview", async (req, res) => {
  try {
    const body = normalizeOrderBody((req.body ?? {}) as Record<string, unknown>);
    const result = await previewPaperOrder(body);
    if ("error" in result) {
      res.status(400).json({
        success: false,
        code: result.code ?? "PAPER_ORDER_REJECTED",
        message: result.error,
      });
      return;
    }
    res.json({ success: true, preview: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Preview failed";
    console.error("[paper-execution] preview failed", message);
    res.status(500).json({ success: false, message });
  }
});

paperTradingRouter.post("/submit", async (req, res) => {
  try {
    const body = normalizeOrderBody((req.body ?? {}) as Record<string, unknown>);
    const result = await submitPaperOrder(body);
    if (!result.success) {
      res.status(400).json({
        success: false,
        code: result.code ?? "PAPER_ORDER_REJECTED",
        message: result.error ?? result.message ?? "Paper order rejected",
      });
      return;
    }
    res.json({
      success: true,
      order: result.order,
      account: result.account,
      position: result.position,
      message: result.message ?? "Paper order submitted",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Submit failed";
    console.error("[paper-execution] submit failed", message);
    res.status(500).json({ success: false, code: "PAPER_SUBMIT_FAILED", message });
  }
});

paperTradingRouter.patch("/orders/:id", (req, res) => {
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
});

paperTradingRouter.post("/orders/:id/cancel", (req, res) => {
  const ok = cancelPaperOrder(req.params.id);
  if (!ok) {
    res.status(404).json({ success: false, message: "Order not found" });
    return;
  }
  res.json({ success: true, message: "Paper order cancelled" });
});

paperTradingRouter.post("/cancel-all", (_req, res) => {
  const count = cancelAllPaperOrders();
  res.json({ success: true, cancelled: count });
});

paperTradingRouter.post("/position/close-partial", async (req, res) => {
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
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Partial close failed";
    console.error("[paper-execution] close-partial failed", message);
    res.status(500).json({ success: false, code: "PARTIAL_CLOSE_FAILED", message });
  }
});

paperTradingRouter.post("/close-position", async (_req, res) => {
  try {
    const result = await closePaperPosition();
    if (!result.success) {
      res.status(400).json({
        success: false,
        code: result.code,
        message: result.message,
      });
      return;
    }
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Close failed";
    console.error("[paper-execution] close failed", message);
    res.status(500).json({ success: false, message });
  }
});

paperTradingRouter.post("/kill-switch", async (_req, res) => {
  try {
    res.json(await killSwitchPaper());
  } catch (err) {
    const message = err instanceof Error ? err.message : "Kill switch failed";
    console.error("[paper-execution] kill-switch failed", message);
    res.status(500).json({ success: false, message });
  }
});

paperTradingRouter.post("/reset", (_req, res) => {
  try {
    const state = resetPaperEngine();
    res.json({ success: true, state });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Reset failed";
    console.error("[paper-settings] full reset failed", message);
    res.status(500).json({ success: false, message });
  }
});
