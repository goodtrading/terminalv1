import { Router, type Request, type Response } from "express";
import { requirePaperUserId } from "../middleware/paperAuth";
import { requireSaasAuth } from "../middleware/saasAuth";
import { LIVE_EXECUTION_WINDOW_QUERY_TIMEOUT, LIVE_EXECUTION_WINDOW_RESULT_LIMIT_EXCEEDED } from "../services/orders/goodTradingLiveExecutionWindowRepository";
import { buildExecutionReport } from "../services/reports/executionReportService";
import { buildLiveExecutionWindowReport, LIVE_REPORT_REQUEST_DEADLINE, LIVE_REPORT_REQUEST_DEADLINE_MS } from "../services/reports/liveExecutionWindowReportService";
import { getSessionExecutionNarrative } from "../services/reports/sessionNarrativeService";

export const reportsRouter = Router();

reportsRouter.get("/execution", requireSaasAuth, async (req: Request, res: Response) => {
  const userId = requirePaperUserId(req, res);
  if (userId == null) return;
  const source = req.query.source;
  const symbol = typeof req.query.symbol === "string" ? req.query.symbol : undefined;
  try {
    const payload = await buildExecutionReport(userId, source, symbol);
    res.json(payload);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to build execution report";
    res.status(500).json({ success: false, message });
  }
});

function queryString(req: Request, key: string): string | null {
  return typeof req.query[key] === "string" && req.query[key].trim() !== "" ? req.query[key] : null;
}

function liveReportError(err: unknown): { status: number; code: string } {
  const message = err instanceof Error ? err.message : "";
  if (message === "LIVE_REPORT_INVALID_REQUEST") return { status: 400, code: "LIVE_REPORT_INVALID_REQUEST" };
  if (message === "LIVE_REPORT_ACCOUNT_NOT_FOUND") return { status: 404, code: "LIVE_REPORT_ACCOUNT_NOT_FOUND" };
  if (message === LIVE_EXECUTION_WINDOW_RESULT_LIMIT_EXCEEDED) return { status: 413, code: "LIVE_REPORT_RESULT_LIMIT_EXCEEDED" };
  if (message === LIVE_EXECUTION_WINDOW_QUERY_TIMEOUT) return { status: 504, code: "LIVE_REPORT_QUERY_TIMEOUT" };
  if (message === LIVE_REPORT_REQUEST_DEADLINE || message === "LIVE_EXECUTION_WINDOW_CANCELLED") return { status: 504, code: "LIVE_REPORT_REQUEST_DEADLINE" };
  return { status: 500, code: "LIVE_REPORT_FAILED" };
}

reportsRouter.get("/live-execution-window", requireSaasAuth, async (req: Request, res: Response) => {
  const authenticatedUserId = req.saasUser?.id;
  if (typeof authenticatedUserId !== "number" || !Number.isSafeInteger(authenticatedUserId) || authenticatedUserId <= 0) {
    res.status(401).json({ success: false, code: "UNAUTHORIZED", message: "Authentication required." });
    return;
  }
  const userId: number = authenticatedUserId;
  const startInclusive = queryString(req, "startInclusive");
  const endExclusive = queryString(req, "endExclusive");
  const timestampPolicy = queryString(req, "timestampPolicy");
  if (!startInclusive || !endExclusive || !timestampPolicy) {
    res.status(400).json({ success: false, code: "LIVE_REPORT_INVALID_REQUEST", message: "startInclusive, endExclusive and timestampPolicy are required." });
    return;
  }
  const controller = new AbortController();
  let disconnected = false;
  let deadlineExpired = false;
  const deadline = setTimeout(() => {
    deadlineExpired = true;
    controller.abort();
  }, LIVE_REPORT_REQUEST_DEADLINE_MS);
  const abortOnDisconnect = () => {
    if (!res.writableEnded) {
      disconnected = true;
      controller.abort();
    }
  };
  req.on("aborted", abortOnDisconnect);
  res.on("close", abortOnDisconnect);
  try {
    const report = await buildLiveExecutionWindowReport({
      userId,
      startInclusive,
      endExclusive,
      timestampPolicy: timestampPolicy as "PROVIDER_REPORTED_TIMESTAMP" | "GOODTRADING_OBSERVATION_TIME",
      signal: controller.signal,
    });
    if (!disconnected && !res.writableEnded) res.json({ success: true, report });
  } catch (err) {
    if (disconnected || res.writableEnded) return;
    const mapped = deadlineExpired ? { status: 504, code: "LIVE_REPORT_REQUEST_DEADLINE" } : liveReportError(err);
    res.status(mapped.status).json({ success: false, code: mapped.code, message: "Live execution report unavailable." });
  } finally {
    clearTimeout(deadline);
    req.off("aborted", abortOnDisconnect);
    res.off("close", abortOnDisconnect);
  }
});

reportsRouter.get("/session-narrative", requireSaasAuth, async (req: Request, res: Response) => {
  const userId = requirePaperUserId(req, res);
  if (userId == null) return;
  const source = req.query.source;
  const symbol = typeof req.query.symbol === "string" ? req.query.symbol : undefined;
  try {
    const payload = await getSessionExecutionNarrative(userId, source, symbol);
    res.json(payload);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to build session narrative";
    res.status(500).json({ success: false, message });
  }
});
