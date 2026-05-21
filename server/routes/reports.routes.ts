import { Router } from "express";
import { getPaperExecutionReport } from "../services/reports/paperExecutionReportService";

export const reportsRouter = Router();

reportsRouter.get("/execution", (_req, res) => {
  try {
    const report = getPaperExecutionReport();
    res.json(report);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to build execution report";
    res.status(500).json({ success: false, message });
  }
});
