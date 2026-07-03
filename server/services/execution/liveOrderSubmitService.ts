import {
  getFirstConnectedConnectionForUser,
  getCredentialsForUser,
} from "../exchanges/bingx/bingxCredentialStore";
import {
  formatQuantityForBingX,
  getBingXSymbolRules,
  validateQuantityAgainstRules,
} from "../exchanges/bingx/bingxSymbolRulesService";
import {
  generateLiveClientOrderId,
  submitBingXLimitOrder,
  LiveMarketOrdersDisabledError,
} from "../exchanges/bingx/bingxLiveExecutionAdapter";
import { BingXApiError } from "../exchanges/bingx/bingxHttpClient";
import { clearBingXReadOnlyCache } from "../exchanges/bingx/bingxReadOnlyService";
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
  validateNonMarketableOrder,
  isCriticalBingXLiveBlocker,
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
import { assertBingxWriteNotFrozen } from "../exchanges/bingx/bingxReadOnlyFreeze";
import { isLiveLimitTestMode } from "./riskGuard";

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
    marginUsdt: request.marginUsdt,
    sizingMode: request.sizingMode,
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

  const freeze = assertBingxWriteNotFrozen();
  if (!freeze.ok) {
    const result = baseBlockedResult(
      request,
      freeze.blockers,
      "LIVE ORDER BLOCKED — read-only freeze",
    );
    result.clientOrderId = clientOrderId;
    await emitLiveOrderSubmitBlocked(uid, request, result);
    return result;
  }

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
  const testMode = isLiveLimitTestMode();

  // In test mode, warn if SL/TP provided but not sent
  if (testMode) {
    if (request.stopLossPrice != null && request.stopLossPrice > 0) {
      preview.warnings.push("SL provided but not sent in live limit test mode. Manage SL manually on BingX after fill.");
    }
    if (request.takeProfitPrice != null && request.takeProfitPrice > 0) {
      preview.warnings.push("TP provided but not sent in live limit test mode. Manage TP manually on BingX after fill.");
    }
  }

  // Validate non-marketable for LIMIT orders (always enforced, even in test mode)
  // Use mark price from preview estimate, which is now always the market price (not limit price)
  const markPrice = preview.estimate.entryPrice;
  const nonMarketableBlockers = validateNonMarketableOrder(
    request.side,
    request.limitPrice,
    markPrice,
  );
  if (nonMarketableBlockers.length > 0) {
    const result: LiveOrderSubmitResult = {
      mode: "live",
      exchange: "bingx",
      symbol: normalizeSymbol(request.symbol),
      side: request.side,
      type: "limit",
      orderSubmitted: false,
      clientOrderId,
      status: "blocked",
      blockers: nonMarketableBlockers,
      warnings: preview.warnings.slice(0, 8),
      estimate,
      message: "LIVE ORDER BLOCKED — marketable limit order",
    };
    await emitLiveOrderSubmitBlocked(uid, request, result);
    return result;
  }

  const previewBlockers = validateLiveSubmitPreviewRisk(preview);

  // Final filter for test mode: remove artificial blockers, move to warnings
  let finalBlockers = previewBlockers;
  let additionalWarnings: string[] = [];

  if (testMode) {
    const originalBlockers = [...previewBlockers];
    finalBlockers = originalBlockers.filter(isCriticalBingXLiveBlocker);
    additionalWarnings = originalBlockers
      .filter((b) => !isCriticalBingXLiveBlocker(b))
      .map((b) => `[test mode warning] ${b}`);
  }

  if (finalBlockers.length > 0) {
    const result: LiveOrderSubmitResult = {
      mode: "live",
      exchange: "bingx",
      symbol: normalizeSymbol(request.symbol),
      side: request.side,
      type: "limit",
      orderSubmitted: false,
      clientOrderId,
      status: "blocked",
      blockers: finalBlockers,
      warnings: [...preview.warnings.slice(0, 8), ...additionalWarnings],
      estimate,
      message: "LIVE ORDER BLOCKED — risk guard failed",
    };
    await emitLiveOrderSubmitBlocked(uid, request, result);
    return result;
  }

  // Validate and normalize quantity against BingX symbol rules before submit
  let submitQuantity = estimate.quantity;

  try {
    const symbolRules = await getBingXSymbolRules(normalizeSymbol(request.symbol));
    const validation = validateQuantityAgainstRules(
      estimate.quantity,
      request.limitPrice,
      symbolRules,
    );
    if (!validation.valid) {
      if (testMode) {
        // In test mode, warn but allow submit - BingX will validate
        console.warn("[live-submit] quantity validation warning in test mode", {
          symbol: normalizeSymbol(request.symbol),
          error: validation.error,
        });
        submitQuantity = estimate.quantity;
      } else {
        const result: LiveOrderSubmitResult = {
          mode: "live",
          exchange: "bingx",
          symbol: normalizeSymbol(request.symbol),
          side: request.side,
          type: "limit",
          orderSubmitted: false,
          clientOrderId,
          status: "blocked",
          blockers: [validation.error || "Quantity validation failed"],
          warnings: preview.warnings.slice(0, 8),
          estimate,
          message: "LIVE ORDER BLOCKED — quantity invalid",
        };
        await emitLiveOrderSubmitBlocked(uid, request, result);
        return result;
      }
    } else {
      submitQuantity = validation.normalizedQty ?? estimate.quantity;
    }
  } catch (err) {
    // If symbol rules fetch fails, block live submit with explicit error (unless test mode)
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.warn("[live-submit] symbol rules fetch failed", {
      symbol: normalizeSymbol(request.symbol),
      error: errorMsg,
    });
    if (testMode) {
      // In test mode, warn but allow submit - BingX will validate
      console.warn("[live-submit] symbol rules unavailable in test mode, allowing submit");
      submitQuantity = estimate.quantity;
    } else {
      const result: LiveOrderSubmitResult = {
        mode: "live",
        exchange: "bingx",
        symbol: normalizeSymbol(request.symbol),
        side: request.side,
        type: "limit",
        orderSubmitted: false,
        clientOrderId,
        status: "blocked",
        blockers: [`Live submit blocked: BingX symbol rules unavailable. Error: ${errorMsg}`],
        warnings: preview.warnings.slice(0, 8),
        estimate,
        message: "LIVE ORDER BLOCKED — symbol rules unavailable",
      };
      await emitLiveOrderSubmitBlocked(uid, request, result);
      return result;
    }
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
      quantity: submitQuantity,
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

    // Auto-refresh BingX snapshot after successful submit to sync open orders
    // Cache clear errors should not convert a successful submit to failed
    try {
      console.log("[bingx-live-submit] auto-refreshing snapshot after submit");
      clearBingXReadOnlyCache(conn.id, uid);
    } catch (err) {
      warnings.push("Order submitted, but local cache refresh failed. Click Sync to refresh.");
      console.warn("[bingx-live-submit] cache clear failed", err);
    }

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
