import { Router, type Request, type Response } from "express";
import { requirePaperUserId } from "../middleware/paperAuth";
import { requireSaasAuth } from "../middleware/saasAuth";
import { getPaperExecutionReport } from "../services/reports/paperExecutionReportService";
import { runWithPaperUser } from "../services/paperTrading/paperUserContext";

export const reportsRouter = Router();

reportsRouter.get("/execution", requireSaasAuth, (req: Request, res: Response) => {
  const userId = requirePaperUserId(req, res);
  if (userId == null) return;
  try {
    const report = runWithPaperUser(userId, () => getPaperExecutionReport());
    res.json(report);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to build execution report";
    res.status(500).json({ success: false, message });
  }
});
