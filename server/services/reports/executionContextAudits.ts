import { emitAuditEvent } from "../system/auditLogService";
import type { ExecutionContextSnapshot } from "./executionContextTypes";

const lastCaptureWarn = new Map<string, number>();
const CAPTURE_WARN_THROTTLE_MS = 120_000;

export async function emitExecutionContextCaptured(
  userId: number | undefined,
  source: "paper" | "bingx",
  tradeId: string,
  phase: "entry" | "exit",
): Promise<void> {
  await emitAuditEvent({
    userId,
    type: "execution_context_captured",
    severity: "info",
    message: `Execution context captured (${source} ${phase})`,
    metadata: {
      source,
      tradeId,
      phase,
    },
  });
}

export async function emitExecutionContextCaptureFailed(
  userId: number | undefined,
  source: "paper" | "bingx",
  tradeId: string,
  reason: string,
): Promise<void> {
  await emitAuditEvent({
    userId,
    type: "execution_context_warning",
    severity: "warning",
    message: "Execution context capture failed",
    metadata: { source, tradeId, reason: reason.slice(0, 120) },
  });
}

export async function emitExecutionContextWarningsIfNeeded(
  userId: number | undefined,
  tradeId: string,
  context: ExecutionContextSnapshot,
): Promise<void> {
  const key = `${userId ?? 0}:${tradeId}`;
  const now = Date.now();
  if (now - (lastCaptureWarn.get(key) ?? 0) < CAPTURE_WARN_THROTTLE_MS) return;

  const shouldWarn =
    !context.risk.stopLossDetected ||
    context.diagnostics.contextAlignment === "danger" ||
    context.diagnostics.contextAlignment === "conflicted";

  if (!shouldWarn) return;
  lastCaptureWarn.set(key, now);

  await emitAuditEvent({
    userId,
    type: "execution_context_warning",
    severity:
      context.diagnostics.contextAlignment === "danger" ? "warning" : "info",
    message: context.diagnostics.summary.slice(0, 200),
    metadata: {
      tradeId,
      source: context.source,
      alignment: context.diagnostics.contextAlignment,
      stopLossDetected: context.risk.stopLossDetected,
    },
  });
}
