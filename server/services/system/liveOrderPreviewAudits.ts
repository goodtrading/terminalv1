import { emitAuditEvent } from "./auditLogService";
import type {
  LiveOrderPreviewRequest,
  LiveOrderPreviewResult,
} from "../execution/liveOrderPreviewTypes";

export async function emitLiveOrderPreviewRequested(
  userId: number,
  request: Pick<
    LiveOrderPreviewRequest,
    "exchange" | "symbol" | "side" | "type" | "source"
  >,
  notionalUsdt: number | undefined,
): Promise<void> {
  await emitAuditEvent({
    userId,
    type: "live_order_preview_requested",
    severity: "info",
    message: `Live order dry-run preview: ${request.side} ${request.type} ${request.symbol}`,
    metadata: {
      exchange: request.exchange,
      symbol: request.symbol,
      side: request.side,
      type: request.type,
      notionalUsdt,
      source: request.source ?? "manual",
    },
  });
}

export async function emitLiveOrderPreviewBlocked(
  userId: number,
  request: Pick<
    LiveOrderPreviewRequest,
    "exchange" | "symbol" | "side" | "type" | "source"
  >,
  preview: Pick<
    LiveOrderPreviewResult,
    "blockers" | "estimate"
  >,
): Promise<void> {
  await emitAuditEvent({
    userId,
    type: "live_order_preview_blocked",
    severity: "warning",
    message: "Live order dry-run preview blocked",
    metadata: {
      exchange: request.exchange,
      symbol: request.symbol,
      side: request.side,
      type: request.type,
      notionalUsdt: preview.estimate?.notionalUsdt,
      maxLossAccountPct: preview.estimate?.maxLossAccountPct,
      blockers: preview.blockers.slice(0, 12),
      source: request.source ?? "manual",
    },
  });
}

export async function emitLiveOrderPreviewPassed(
  userId: number,
  request: Pick<
    LiveOrderPreviewRequest,
    "exchange" | "symbol" | "side" | "type" | "source"
  >,
  preview: Pick<
    LiveOrderPreviewResult,
    "estimate" | "warnings"
  >,
): Promise<void> {
  await emitAuditEvent({
    userId,
    type: "live_order_preview_passed",
    severity: "info",
    message: "Live order dry-run preview passed",
    metadata: {
      exchange: request.exchange,
      symbol: request.symbol,
      side: request.side,
      type: request.type,
      notionalUsdt: preview.estimate?.notionalUsdt,
      maxLossAccountPct: preview.estimate?.maxLossAccountPct,
      warnings: preview.warnings.slice(0, 8),
      source: request.source ?? "manual",
    },
  });
}
