import { Router, type IRouter } from "express";
import { updateMarketState, mergeAlerts } from "../lib/store";
import { logger } from "../lib/logger";

const router: IRouter = Router();

/**
 * POST /api/terminal/push
 *
 * Receives a full state update from the trading terminal.
 * Protected by the X-Terminal-Key header — set TERMINAL_KEY env var.
 *
 * Example curl:
 *   curl -X POST https://<host>/api/terminal/push \
 *     -H "Content-Type: application/json" \
 *     -H "X-Terminal-Key: <your-key>" \
 *     -d '{"marketState": {...}, "alerts": [...]}'
 */
router.post("/terminal/push", (req, res) => {
  const expectedKey = process.env["TERMINAL_KEY"];

  if (!expectedKey) {
    // TERMINAL_KEY not configured — reject all pushes to prevent open writes
    res.status(503).json({ error: "Terminal push not configured", code: "NOT_CONFIGURED" });
    return;
  }

  const providedKey = req.headers["x-terminal-key"];
  if (!providedKey || providedKey !== expectedKey) {
    logger.warn({ ip: req.ip }, "Terminal push rejected: invalid key");
    res.status(401).json({ error: "Invalid or missing X-Terminal-Key", code: "UNAUTHORIZED" });
    return;
  }

  const { marketState, alerts } = req.body;

  if (!marketState) {
    res.status(400).json({ error: "marketState is required", code: "BAD_REQUEST" });
    return;
  }

  updateMarketState(marketState);

  if (Array.isArray(alerts) && alerts.length > 0) {
    mergeAlerts(alerts);
  }

  const updatedAt = new Date().toISOString();
  logger.info({ updatedAt }, "Terminal push accepted");

  res.json({ ok: true, updatedAt });
});

export default router;
