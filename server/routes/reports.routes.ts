import { Router, type Request, type Response } from "express";
import { requirePaperUserId } from "../middleware/paperAuth";
import { requireSaasAuth } from "../middleware/saasAuth";
import { buildExecutionReport } from "../services/reports/executionReportService";
import { getSessionExecutionNarrative } from "../services/reports/sessionNarrativeService";

export const reportsRouter = Router();

reportsRouter.get("/execution", requireSaasAuth, async (req: Request, res: Response) => {
  const userId = requirePaperUserId(req, res);
  if (userId == null) return;
  const source = req.query.source;
  const symbol =
    typeof req.query.symbol === "string" ? req.query.symbol : undefined;
  try {
    const payload = await buildExecutionReport(userId, source, symbol);
    res.json(payload);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to build execution report";
    res.status(500).json({ success: false, message });
  }
});

reportsRouter.get(
  "/session-narrative",
  requireSaasAuth,
  async (req: Request, res: Response) => {
    const userId = requirePaperUserId(req, res);
    if (userId == null) return;
    const source = req.query.source;
    const symbol =
      typeof req.query.symbol === "string" ? req.query.symbol : undefined;
    try {
      const payload = await getSessionExecutionNarrative(userId, source, symbol);
      res.json(payload);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to build session narrative";
      res.status(500).json({ success: false, message });
    }
  },
);
