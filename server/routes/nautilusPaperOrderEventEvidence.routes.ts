import { Router, type Request, type Response } from "express";
import { requirePaperUserId } from "../middleware/paperAuth";
import { requireSaasAuth } from "../middleware/saasAuth";
import { listNautilusPaperOrderEventEvidence, persistNautilusPaperOrderEventEvidenceBatch } from "../services/nautilusPaperOrderEventEvidenceRepository";

export const nautilusPaperOrderEventEvidenceRouter = Router();
nautilusPaperOrderEventEvidenceRouter.use(requireSaasAuth);

function accountId(req: Request, res: Response): string | null {
  const userId = requirePaperUserId(req, res);
  return userId == null ? null : String(userId);
}

nautilusPaperOrderEventEvidenceRouter.post("/order-events", async (req, res) => {
  const account = accountId(req, res);
  if (account == null) return;
  const body = req.body as { events?: unknown } | undefined;
  if (!body || !Array.isArray(body.events) || body.events.length === 0 || body.events.length > 1000) {
    res.status(400).json({ code: "INVALID_NAUTILUS_EVIDENCE_BATCH" });
    return;
  }
  try {
    const result = await persistNautilusPaperOrderEventEvidenceBatch(account, body.events);
    res.status(200).json({ acknowledged: true, inserted: result.filter((item) => item.inserted).length, events: result.map((item) => item.evidence) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN";
    const conflict = message.startsWith("PAPER_ORDER_EVENT_EVIDENCE_CONFLICT");
    res.status(conflict ? 409 : 400).json({ code: conflict ? "NAUTILUS_EVIDENCE_CONFLICT" : "INVALID_NAUTILUS_EVIDENCE", message: conflict ? message : "Evidence rejected." });
  }
});

nautilusPaperOrderEventEvidenceRouter.get("/order-events", async (req, res) => {
  const account = accountId(req, res);
  if (account == null) return;
  const clientOrderId = typeof req.query.clientOrderId === "string" ? req.query.clientOrderId : undefined;
  try {
    res.json({ events: await listNautilusPaperOrderEventEvidence(account, clientOrderId) });
  } catch (error) {
    console.error("[nautilus-paper-evidence] read failed", error);
    res.status(503).json({ code: "NAUTILUS_EVIDENCE_READ_FAILED" });
  }
});
