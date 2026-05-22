import { emitAuditEvent } from "../system/auditLogService";
import type { PlaybookMatchResult } from "./playbookMatchTypes";
import type { ExecutionContextSnapshot } from "./executionContextTypes";

const lastPlaybookAudit = new Map<string, number>();
const THROTTLE_MS = 120_000;

export async function emitPlaybookAuditsIfNeeded(
  userId: number | undefined,
  tradeId: string,
  source: "paper" | "bingx",
  playbook: PlaybookMatchResult,
  context?: ExecutionContextSnapshot,
): Promise<void> {
  const key = `${userId ?? 0}:${tradeId}:${source}`;
  const now = Date.now();
  if (now - (lastPlaybookAudit.get(key) ?? 0) < THROTTLE_MS) return;

  const primary = playbook.primary;
  const shouldEmit =
    (source === "bingx" && primary.id === "no_match") ||
    (primary.id !== "no_match" &&
      (context?.risk.riskMirrorStatus === "danger" ||
        context?.diagnostics.contextAlignment === "danger" ||
        primary.invalidations.length >= 2));

  if (!shouldEmit) return;
  lastPlaybookAudit.set(key, now);

  await emitAuditEvent({
    userId,
    type: "execution_context_warning",
    severity:
      context?.risk.riskMirrorStatus === "danger" ? "warning" : "info",
    message: `Playbook: ${primary.name} (${primary.confidence}%)`,
    metadata: {
      tradeId,
      source,
      playbookId: primary.id,
      confidence: primary.confidence,
      status: primary.status,
    },
  });
}
