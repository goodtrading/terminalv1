import { emitAuditEvent } from "./auditLogService";
import type { LiveOrderSubmitRequest } from "../execution/liveOrderSubmitTypes";
import type { LiveOrderSubmitResult } from "../execution/liveOrderSubmitTypes";

export async function emitLiveOrderSubmitRequested(
  userId: number,
  request: Pick<
    LiveOrderSubmitRequest,
    "exchange" | "symbol" | "side" | "type"
  >,
  notionalUsdt: number | undefined,
  clientOrderId: string | undefined,
): Promise<void> {
  await emitAuditEvent({
    userId,
    type: "live_order_submit_requested",
    severity: "warning",
    message: `Live limit submit requested: ${request.side} ${request.symbol}`,
    metadata: {
      exchange: request.exchange,
      symbol: request.symbol,
      side: request.side,
      type: request.type,
      notionalUsdt,
      clientOrderId,
    },
  });
}

export async function emitLiveOrderSubmitBlocked(
  userId: number,
  request: Pick<
    LiveOrderSubmitRequest,
    "exchange" | "symbol" | "side" | "type"
  >,
  result: Pick<
    LiveOrderSubmitResult,
    "blockers" | "estimate" | "clientOrderId"
  >,
): Promise<void> {
  await emitAuditEvent({
    userId,
    type: "live_order_submit_blocked",
    severity: "warning",
    message: "Live limit order submit blocked",
    metadata: {
      exchange: request.exchange,
      symbol: request.symbol,
      side: request.side,
      type: request.type,
      notionalUsdt: result.estimate?.notionalUsdt,
      maxLossAccountPct: result.estimate?.maxLossAccountPct,
      clientOrderId: result.clientOrderId,
      blockers: result.blockers.slice(0, 12),
    },
  });
}

export async function emitLiveOrderSubmitted(
  userId: number,
  request: Pick<
    LiveOrderSubmitRequest,
    "exchange" | "symbol" | "side" | "type"
  >,
  result: Pick<
    LiveOrderSubmitResult,
    "orderId" | "clientOrderId" | "estimate" | "warnings"
  >,
): Promise<void> {
  await emitAuditEvent({
    userId,
    type: "live_order_submitted",
    severity: "warning",
    message: `Live limit order submitted: ${request.symbol}`,
    metadata: {
      exchange: request.exchange,
      symbol: request.symbol,
      side: request.side,
      type: request.type,
      notionalUsdt: result.estimate?.notionalUsdt,
      maxLossAccountPct: result.estimate?.maxLossAccountPct,
      orderId: result.orderId,
      clientOrderId: result.clientOrderId,
      warnings: result.warnings.slice(0, 8),
    },
  });
}

export async function emitLiveOrderSubmitFailed(
  userId: number,
  request: Pick<
    LiveOrderSubmitRequest,
    "exchange" | "symbol" | "side" | "type"
  >,
  safeMessage: string,
  clientOrderId: string | undefined,
): Promise<void> {
  await emitAuditEvent({
    userId,
    type: "live_order_submit_failed",
    severity: "error",
    message: "Live limit order submit failed",
    metadata: {
      exchange: request.exchange,
      symbol: request.symbol,
      side: request.side,
      type: request.type,
      clientOrderId,
      error: safeMessage.slice(0, 160),
    },
  });
}
