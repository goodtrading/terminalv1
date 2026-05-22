import {
  getFirstConnectedConnectionForUser,
  getCredentialsForUser,
} from "../exchanges/bingx/bingxCredentialStore";
import {
  generateLiveClientOrderId,
  submitBingXLimitOrder,
  LiveMarketOrdersDisabledError,
} from "../exchanges/bingx/bingxLiveExecutionAdapter";
import { BingXApiError } from "../exchanges/bingx/bingxHttpClient";
import { previewBingXLiveOrder } from "./liveOrderPreviewService";
import type { LiveOrderPreviewRequest } from "./liveOrderPreviewTypes";
import { getLiveTradingReadiness } from "./liveTradingReadinessService";
import {
  assertLiveTradingAllowed,
  checkLiveTradingActionAllowed,
} from "./liveTradingGuard";
import {
  mergeGuardBlockers,
  validateLiveSubmitConfirmation,
  validateLiveSubmitEnvFlags,
  validateLiveSubmitPreviewRisk,
  validateLiveSubmitReadiness,
  validateLiveSubmitShape,
} from "./liveOrderSubmitGuards";
import {
  emitLiveOrderSubmitBlocked,
  emitLiveOrderSubmitFailed,
  emitLiveOrderSubmitRequested,
  emitLiveOrderSubmitted,
} from "../system/liveOrderSubmitAudits";
import type {
  LiveOrderSubmitRequest,
  LiveOrderSubmitResult,
} from "./liveOrderSubmitTypes";
import type { LiveOrderPreviewResult } from "./liveOrderPreviewTypes";

function normalizeSymbol(symbol: string): string {
  return symbol.trim().toUpperCase().replace(/\s+/g, "");
}

function baseBlockedResult(
  request: LiveOrderSubmitRequest,
  blockers: string[],
  message: string,
  estimate?: LiveOrderSubmitResult["estimate"],
): LiveOrderSubmitResult {
  return {
    mode: "live",
    exchange: "bingx",
    symbol: normalizeSymbol(request.symbol),
    side: request.side,
    type: "limit",
    orderSubmitted: false,
    status: "blocked",
    blockers,
    warnings: [],
    estimate: estimate ?? {
      entryPrice: request.limitPrice,
      quantity: 0,
      notionalUsdt: 0,
    },
    message,
  };
}

function toPreviewRequest(request: LiveOrderSubmitRequest): LiveOrderPreviewRequest {
  return {
    exchange: "bingx",
    symbol: request.symbol,
    side: request.side,
    type: "limit",
    quantity: request.quantity,
    notionalUsdt: request.notionalUsdt,
    limitPrice: request.limitPrice,
    stopLossPrice: request.stopLossPrice,
    takeProfitPrice: request.takeProfitPrice,
    leverage: request.leverage,
    reduceOnly: request.reduceOnly,
    source: "manual",
  };
}

function buildEstimateFromPreview(
  preview: LiveOrderPreviewResult,
  limitPrice: number,
): LiveOrderSubmitResult["estimate"] {
  return {
    entryPrice: preview.estimate.entryPrice ?? limitPrice,
    quantity: preview.estimate.quantity,
    notionalUsdt: preview.estimate.notionalUsdt,
    maxLossUsdt: preview.estimate.maxLossUsdt,
    maxLossAccountPct: preview.estimate.maxLossAccountPct,
    estimatedFeeUsdt: preview.estimate.estimatedFeeUsdt,
  };
}

export async function submitBingXLiveLimitOrder(
  userId: string | number,
  request: LiveOrderSubmitRequest,
): Promise<LiveOrderSubmitResult> {
  const uid = Math.floor(Number(userId));
  if (!Number.isFinite(uid) || uid <= 0) {
    throw new Error("INVALID_USER_ID");
  }

  const clientOrderId = generateLiveClientOrderId();

  const shapeBlockers = validateLiveSubmitShape(request);
  if (shapeBlockers.length > 0) {
    const result = baseBlockedResult(
      request,
      shapeBlockers,
      "LIVE ORDER BLOCKED — invalid request",
    );
    result.clientOrderId = clientOrderId;
    await emitLiveOrderSubmitBlocked(uid, request, result);
    return result;
  }

  const confirmBlockers = validateLiveSubmitConfirmation(request);
  if (confirmBlockers.length > 0) {
    const result = baseBlockedResult(
      request,
      confirmBlockers,
      "LIVE ORDER BLOCKED — confirmation required",
    );
    result.clientOrderId = clientOrderId;
    await emitLiveOrderSubmitBlocked(uid, request, result);
    return result;
  }

  const envBlockers = validateLiveSubmitEnvFlags();
  if (envBlockers.length > 0) {
    const result = baseBlockedResult(
      request,
      envBlockers,
      "LIVE ORDER BLOCKED — live flags or kill switch",
    );
    result.clientOrderId = clientOrderId;
    await emitLiveOrderSubmitBlocked(uid, request, result);
    return result;
  }

  const guardBlockers = mergeGuardBlockers(
    checkLiveTradingActionAllowed("submit_order"),
  );
  if (guardBlockers.length > 0) {
    const result = baseBlockedResult(
      request,
      guardBlockers,
      "LIVE ORDER BLOCKED — live trading guard",
    );
    result.clientOrderId = clientOrderId;
    await emitLiveOrderSubmitBlocked(uid, request, result);
    return result;
  }

  let readiness: Awaited<ReturnType<typeof getLiveTradingReadiness>>;
  try {
    readiness = await getLiveTradingReadiness(uid, "bingx");
  } catch {
    const result = baseBlockedResult(
      request,
      ["Live readiness unavailable."],
      "LIVE ORDER BLOCKED — readiness check failed",
    );
    result.clientOrderId = clientOrderId;
    await emitLiveOrderSubmitBlocked(uid, request, result);
    return result;
  }

  const readinessBlockers = validateLiveSubmitReadiness(readiness);
  if (readinessBlockers.length > 0) {
    const result = baseBlockedResult(
      request,
      readinessBlockers,
      "LIVE ORDER BLOCKED — not ready for live",
    );
    result.clientOrderId = clientOrderId;
    await emitLiveOrderSubmitBlocked(uid, request, result);
    return result;
  }

  const preview = await previewBingXLiveOrder(uid, toPreviewRequest(request));
  const estimate = buildEstimateFromPreview(preview, request.limitPrice);

  const previewBlockers = validateLiveSubmitPreviewRisk(preview);
  if (previewBlockers.length > 0) {
    const result: LiveOrderSubmitResult = {
      mode: "live",
      exchange: "bingx",
      symbol: normalizeSymbol(request.symbol),
      side: request.side,
      type: "limit",
      orderSubmitted: false,
      clientOrderId,
      status: "blocked",
      blockers: previewBlockers,
      warnings: preview.warnings.slice(0, 8),
      estimate,
      message: "LIVE ORDER BLOCKED — risk guard failed",
    };
    await emitLiveOrderSubmitBlocked(uid, request, result);
    return result;
  }

  const conn = getFirstConnectedConnectionForUser(uid);
  if (!conn) {
    const result = baseBlockedResult(
      request,
      ["No BingX connection"],
      "LIVE ORDER BLOCKED — no connection",
      estimate,
    );
    result.clientOrderId = clientOrderId;
    await emitLiveOrderSubmitBlocked(uid, request, result);
    return result;
  }

  if (
    conn.readOnly ||
    conn.connectionMode === "read-only" ||
    !conn.tradingPermissionConfirmed
  ) {
    const result = baseBlockedResult(
      request,
      [
        conn.readOnly || conn.connectionMode === "read-only"
          ? "Live submit blocked: BingX connection is read-only."
          : "BingX API trading permission not confirmed.",
      ],
      "LIVE ORDER BLOCKED — connection not live-capable",
      estimate,
    );
    result.clientOrderId = clientOrderId;
    await emitLiveOrderSubmitBlocked(uid, request, result);
    return result;
  }

  const credentials = getCredentialsForUser(conn.id, uid);
  if (!credentials) {
    const result = baseBlockedResult(
      request,
      ["Unable to decrypt stored credentials"],
      "LIVE ORDER BLOCKED — credentials unavailable",
      estimate,
    );
    result.clientOrderId = clientOrderId;
    await emitLiveOrderSubmitBlocked(uid, request, result);
    return result;
  }

  assertLiveTradingAllowed("submit_order");

  await emitLiveOrderSubmitRequested(
    uid,
    request,
    estimate.notionalUsdt,
    clientOrderId,
  );

  const warnings: string[] = [
    "REAL LIMIT ORDER — submitted to BingX.",
    ...preview.warnings.slice(0, 4),
  ];

  try {
    const exchangeResult = await submitBingXLimitOrder({
      credentials,
      symbol: request.symbol,
      side: request.side,
      type: "limit",
      quantity: estimate.quantity,
      limitPrice: request.limitPrice,
      clientOrderId,
      stopLossPrice: request.stopLossPrice,
      takeProfitPrice: request.takeProfitPrice,
      reduceOnly: request.reduceOnly,
    });

    if (!exchangeResult.protectiveSlAttached) {
      warnings.push(
        "Protective SL was validated for risk but not placed on exchange in this phase.",
      );
    }

    warnings.push(
      "Cancel/close from terminal is disabled in this phase. Manage the order directly from BingX.",
    );

    const result: LiveOrderSubmitResult = {
      mode: "live",
      exchange: "bingx",
      symbol: normalizeSymbol(request.symbol),
      side: request.side,
      type: "limit",
      orderSubmitted: true,
      orderId: exchangeResult.orderId,
      clientOrderId: exchangeResult.clientOrderId,
      status: "submitted",
      blockers: [],
      warnings,
      estimate,
      message: "LIVE LIMIT ORDER SUBMITTED",
    };

    await emitLiveOrderSubmitted(uid, request, result);
    return result;
  } catch (err) {
    if (err instanceof LiveMarketOrdersDisabledError) {
      const result = baseBlockedResult(
        request,
        [err.message],
        "LIVE ORDER BLOCKED — market disabled",
        estimate,
      );
      result.clientOrderId = clientOrderId;
      await emitLiveOrderSubmitBlocked(uid, request, result);
      return result;
    }

    const safeMessage =
      err instanceof BingXApiError
        ? err.message.slice(0, 160)
        : err instanceof Error
          ? err.message.slice(0, 160)
          : "Exchange submit failed";

    await emitLiveOrderSubmitFailed(uid, request, safeMessage, clientOrderId);

    return {
      mode: "live",
      exchange: "bingx",
      symbol: normalizeSymbol(request.symbol),
      side: request.side,
      type: "limit",
      orderSubmitted: false,
      clientOrderId,
      status: "failed",
      blockers: [safeMessage],
      warnings: [],
      estimate,
      message: "LIVE ORDER FAILED",
    };
  }
}
