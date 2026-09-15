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
import { getGoodTradingAccountByUserId } from "../accounts/goodTradingAccountRepository";
import { resolveCanonicalMarket } from "../marketIdentity/canonicalMarketResolver";
import {
  createIntentWithInitialAttempt,
  getIntentByRequestIdempotencyKey,
  listAttemptsForIntent,
  markSubmissionStarted,
  markSubmissionResponseObserved,
  markUnknownSubmissionOutcome,
  markReconciliationRequired,
} from "../orders/goodTradingOrderIntentRepository";
import {
  generateBrokerClientOrderId,
  generateLogicalOrderUid,
  generateSubmissionAttemptId,
} from "../../../shared/durableOrderIntent";

import {
  classifyLiveSubmissionError,
} from "./liveSubmissionOutcomeClassifier";

export type LiveSubmitDependencies = Readonly<{
  getReadiness?: typeof getLiveTradingReadiness;
  previewOrder?: typeof previewBingXLiveOrder;
  getConnection?: typeof getFirstConnectedConnectionForUser;
  getCredentials?: typeof getCredentialsForUser;
  getSymbolRules?: typeof getBingXSymbolRules;
  submitOrder?: typeof submitBingXLimitOrder;
  getAccount?: typeof getGoodTradingAccountByUserId;
  getExistingIntent?: typeof getIntentByRequestIdempotencyKey;
  listIntentAttempts?: typeof listAttemptsForIntent;
  createIntent?: typeof createIntentWithInitialAttempt;
  markStarted?: typeof markSubmissionStarted;
  markResponseObserved?: typeof markSubmissionResponseObserved;
  markUnknownOutcome?: typeof markUnknownSubmissionOutcome;
  markReconciliation?: typeof markReconciliationRequired;
}>;

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
  dependencies: LiveSubmitDependencies = {},
): Promise<LiveOrderSubmitResult> {
  const readinessFn = dependencies.getReadiness ?? getLiveTradingReadiness;
  const previewFn = dependencies.previewOrder ?? previewBingXLiveOrder;
  const connectionFn = dependencies.getConnection ?? getFirstConnectedConnectionForUser;
  const credentialsFn = dependencies.getCredentials ?? getCredentialsForUser;
  const symbolRulesFn = dependencies.getSymbolRules ?? getBingXSymbolRules;
  const submitFn = dependencies.submitOrder ?? submitBingXLimitOrder;
  const accountFn = dependencies.getAccount ?? getGoodTradingAccountByUserId;
  const existingIntentFn = dependencies.getExistingIntent ?? getIntentByRequestIdempotencyKey;
  const listAttemptsFn = dependencies.listIntentAttempts ?? listAttemptsForIntent;
  const createIntentFn = dependencies.createIntent ?? createIntentWithInitialAttempt;
  const markStartedFn = dependencies.markStarted ?? markSubmissionStarted;
  const markResponseObservedFn = dependencies.markResponseObserved ?? markSubmissionResponseObserved;
  const markUnknownOutcomeFn = dependencies.markUnknownOutcome ?? markUnknownSubmissionOutcome;
  const markReconciliationFn = dependencies.markReconciliation ?? markReconciliationRequired;
  const uid = Math.floor(Number(userId));
  if (!Number.isFinite(uid) || uid <= 0) {
    throw new Error("INVALID_USER_ID");
  }

  let clientOrderId: string | undefined;
  const ensureClientOrderId = (): string => {
    if (!clientOrderId) clientOrderId = generateLiveClientOrderId();
    return clientOrderId;
  };

  const freeze = assertBingxWriteNotFrozen();
  if (!freeze.ok) {
    const result = baseBlockedResult(
      request,
      freeze.blockers,
      "LIVE ORDER BLOCKED — read-only freeze",
    );
    result.clientOrderId = ensureClientOrderId();
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
    result.clientOrderId = ensureClientOrderId();
    await emitLiveOrderSubmitBlocked(uid, request, result);
    return result;
  }

  if (normalizeSymbol(request.symbol) !== "BTC-USDT") {
    const result = baseBlockedResult(
      request,
      ["MARKET_IDENTITY_UNRESOLVED"],
      "LIVE ORDER BLOCKED — unsupported LIVE BingX market",
    );
    result.clientOrderId = ensureClientOrderId();
    await emitLiveOrderSubmitBlocked(uid, request, result);
    return result;
  }

  if (request.reduceOnly === true) {
    const result = baseBlockedResult(
      request,
      ["REDUCE_ONLY_NOT_SUPPORTED_FOR_OPENING_ONLY_V1"],
      "LIVE ORDER BLOCKED — reduceOnly is not permitted",
    );
    result.clientOrderId = ensureClientOrderId();
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
    result.clientOrderId = ensureClientOrderId();
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
    result.clientOrderId = ensureClientOrderId();
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
    result.clientOrderId = ensureClientOrderId();
    await emitLiveOrderSubmitBlocked(uid, request, result);
    return result;
  }

  let readiness: Awaited<ReturnType<typeof getLiveTradingReadiness>>;
  try {
    readiness = await readinessFn(uid, "bingx");
  } catch {
    const result = baseBlockedResult(
      request,
      ["Live readiness unavailable."],
      "LIVE ORDER BLOCKED — readiness check failed",
    );
    result.clientOrderId = ensureClientOrderId();
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
    result.clientOrderId = ensureClientOrderId();
    await emitLiveOrderSubmitBlocked(uid, request, result);
    return result;
  }

  const preview = await previewFn(uid, toPreviewRequest(request));
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
      clientOrderId: ensureClientOrderId(),
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
      clientOrderId: ensureClientOrderId(),
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
    const symbolRules = await symbolRulesFn(normalizeSymbol(request.symbol));
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
          clientOrderId: ensureClientOrderId(),
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
        clientOrderId: ensureClientOrderId(),
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

  const preConn = connectionFn(uid);
  if (!preConn || preConn.readOnly || preConn.connectionMode === "read-only" || !preConn.tradingPermissionConfirmed) {
    const result = baseBlockedResult(request, ["BINGX_CONNECTION_NOT_LIVE_CAPABLE"], "LIVE ORDER BLOCKED — connection not live-capable", estimate);
    result.clientOrderId = ensureClientOrderId();
    await emitLiveOrderSubmitBlocked(uid, request, result);
    return result;
  }
  const preCredentials = credentialsFn(preConn.id, uid);
  if (!preCredentials) {
    const result = baseBlockedResult(request, ["BINGX_CREDENTIALS_UNAVAILABLE"], "LIVE ORDER BLOCKED — credentials unavailable", estimate);
    result.clientOrderId = ensureClientOrderId();
    await emitLiveOrderSubmitBlocked(uid, request, result);
    return result;
  }

  const account = await accountFn(uid);
  if (!account) {
    const result = baseBlockedResult(request, ["GOODTRADING_ACCOUNT_NOT_FOUND"], "LIVE ORDER BLOCKED — GoodTrading account not found", estimate);
    result.clientOrderId = ensureClientOrderId();
    await emitLiveOrderSubmitBlocked(uid, request, result);
    return result;
  }

  const market = resolveCanonicalMarket({
    sourceBackend: "BINGX",
    sourceVenue: "BINGX",
    nativeSymbol: normalizeSymbol(request.symbol),
    sourceMarketType: "Perpetual",
  });
  if (!market.ok) {
    const result = baseBlockedResult(request, [market.code], "LIVE ORDER BLOCKED — market identity unresolved", estimate);
    result.clientOrderId = ensureClientOrderId();
    await emitLiveOrderSubmitBlocked(uid, request, result);
    return result;
  }

  const existing = await existingIntentFn(account.accountUid, request.requestIdempotencyKey);
  if (existing) {
    const attempts = await listAttemptsFn(existing.logicalOrderUid);
    const firstAttempt = attempts.find((attempt) => attempt.attemptNumber === 1);
    return {
      mode: "live",
      exchange: "bingx",
      symbol: normalizeSymbol(request.symbol),
      side: request.side,
      type: "limit",
      orderSubmitted: false,
      idempotentReplay: true,
      clientOrderId: firstAttempt?.brokerClientOrderId,
      status: "blocked",
      blockers: [],
      warnings: ["Existing durable submit found; broker call was not repeated."],
      estimate,
      message: "IDEMPOTENT REPLAY — durable submit already exists",
    };
  }

  const logicalOrderUid = generateLogicalOrderUid();
  const brokerClientOrderId = generateBrokerClientOrderId();
  const durableInput = {
    intent: {
      logicalOrderUid,
      goodTradingAccountUid: account.accountUid,
      executionBroker: "BINGX",
      executionEnvironment: "LIVE",
      executionMarketInstrument: market.executionIdentity.instrument,
      executionMarketVenue: market.executionIdentity.venue,
      executionMarketType: market.executionIdentity.marketType,
      canonicalBaseAsset: market.identity.baseAsset,
      canonicalQuoteAsset: market.identity.quoteAsset,
      canonicalSettlementAsset: market.identity.settlementAsset,
      canonicalProductType: market.identity.productType,
      canonicalContractStyle: market.identity.productType === "Perpetual" ? market.identity.contractStyle : null,
      canonicalExpiry: null,
      sourceNativeSymbol: market.provenance.nativeSymbol,
      sourceNativeInstrumentId: market.provenance.nativeInstrumentId ?? null,
      marketMetadataSource: market.provenance.metadataSource,
      marketMappingPolicy: market.provenance.mappingPolicy,
      requestedSide: request.side,
      orderType: "LIMIT" as const,
      requestedSize: String(request.quantity ?? request.notionalUsdt ?? request.marginUsdt ?? submitQuantity),
      requestedSizeUnit: request.quantity != null ? "BTC" as const : "USDT" as const,
      requestedSizingMode: request.quantity != null ? "quantity" as const : request.sizingMode ?? "notional" as const,
      resolvedQuantity: String(submitQuantity),
      resolvedQuantityUnit: "BTC" as const,
      limitPrice: String(request.limitPrice),
      stopLossPrice: request.stopLossPrice == null ? null : String(request.stopLossPrice),
      takeProfitPrice: request.takeProfitPrice == null ? null : String(request.takeProfitPrice),
      timeInForce: "GTC" as const,
      postOnly: false,
      reduceOnly: false,
      requestIdempotencyKey: request.requestIdempotencyKey,
    },
    attempt: {
      attemptId: generateSubmissionAttemptId(),
      intentId: logicalOrderUid,
      attemptNumber: 1,
      brokerClientOrderId,
      submittedQuantity: String(submitQuantity),
      transportState: "PERSISTED" as const,
      startedAt: null,
      responseAt: null,
      outcomeAt: null,
      reconciliationRequiredAt: null,
      brokerOrderId: null,
      rawBrokerStatus: null,
      httpStatus: null,
      errorCode: null,
      errorClass: null,
    },
  };

  let durable;
  try {
    durable = await createIntentFn(durableInput);
  } catch (error) {
    if ((error as { code?: string })?.code === "23505") {
      const raced = await existingIntentFn(account.accountUid, request.requestIdempotencyKey);
      if (raced) {
        const attempts = await listAttemptsFn(raced.logicalOrderUid);
        return { mode: "live", exchange: "bingx", symbol: normalizeSymbol(request.symbol), side: request.side, type: "limit", orderSubmitted: false, idempotentReplay: true, clientOrderId: attempts.find((attempt) => attempt.attemptNumber === 1)?.brokerClientOrderId, status: "blocked", blockers: [], warnings: ["Concurrent durable submit won; broker call was not repeated."], estimate, message: "IDEMPOTENT REPLAY — concurrent request" };
      }
    }
    throw error;
  }

  let started;
  try {
    started = await markStartedFn(durable.intent.logicalOrderUid);
  } catch (error) {
    const result = baseBlockedResult(request, ["SUBMISSION_STARTED_PERSISTENCE_FAILED"], "LIVE ORDER BLOCKED — durable submission start failed", estimate);
    result.clientOrderId = durable.attempt.brokerClientOrderId;
    await emitLiveOrderSubmitBlocked(uid, request, result);
    return result;
  }

  const conn = connectionFn(uid);
  if (!conn) {
    const result = baseBlockedResult(
      request,
      ["No BingX connection"],
      "LIVE ORDER BLOCKED — no connection",
      estimate,
    );
    result.clientOrderId = ensureClientOrderId();
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
    result.clientOrderId = ensureClientOrderId();
    await emitLiveOrderSubmitBlocked(uid, request, result);
    return result;
  }

  const credentials = credentialsFn(conn.id, uid);
  if (!credentials) {
    const result = baseBlockedResult(
      request,
      ["Unable to decrypt stored credentials"],
      "LIVE ORDER BLOCKED — credentials unavailable",
      estimate,
    );
    result.clientOrderId = ensureClientOrderId();
    await emitLiveOrderSubmitBlocked(uid, request, result);
    return result;
  }

  assertLiveTradingAllowed("submit_order");

  await emitLiveOrderSubmitRequested(
    uid,
    request,
    estimate.notionalUsdt,
    durable.attempt.brokerClientOrderId,
  );

  const warnings: string[] = [
    "REAL LIMIT ORDER — submitted to BingX.",
    ...preview.warnings.slice(0, 4),
  ];

  try {
    const exchangeResult = await submitFn({
      credentials,
      symbol: market.executionIdentity.instrument,
      side: request.side,
      type: "limit",
      quantity: submitQuantity,
      limitPrice: request.limitPrice,
      clientOrderId: durable.attempt.brokerClientOrderId,
      stopLossPrice: request.stopLossPrice,
      takeProfitPrice: request.takeProfitPrice,
      timeInForce: "GTC",
      postOnly: false,
      reduceOnly: false,
      submittedQuantity: durable.attempt.submittedQuantity!,
    });

    await markResponseObservedFn(durable.intent.logicalOrderUid, {
      // The current adapter parses JSON through JavaScript numbers; do not promote
      // broker order IDs to durable reconciliation authority until that is fixed.
      brokerOrderId: null,
      rawBrokerStatus: exchangeResult.status ?? "submitted",
      httpStatus: null,
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
    const outcome = classifyLiveSubmissionError(err);
    let outcomePersistenceError: string | undefined;
    try {
      await markUnknownOutcomeFn(durable.intent.logicalOrderUid, {
        errorCode: outcome.errorCode,
        errorClass: outcome.errorClass,
        httpStatus: outcome.httpStatus ?? null,
      });
      await markReconciliationFn(durable.intent.logicalOrderUid);
    } catch (persistenceError) {
      outcomePersistenceError = persistenceError instanceof Error
        ? persistenceError.message.slice(0, 160)
        : "UNKNOWN_OUTCOME_PERSISTENCE_FAILED";
    }

    if (err instanceof LiveMarketOrdersDisabledError) {
      const result = baseBlockedResult(
        request,
        [err.message],
        "LIVE ORDER BLOCKED — market disabled",
        estimate,
      );
      result.clientOrderId = ensureClientOrderId();
      await emitLiveOrderSubmitBlocked(uid, request, result);
      return result;
    }

    const safeMessage = [
      err instanceof BingXApiError
        ? err.message.slice(0, 160)
        : err instanceof Error
          ? err.message.slice(0, 160)
          : "Exchange submit failed",
      ...(outcomePersistenceError ? [`Outcome persistence failed: ${outcomePersistenceError}`] : []),
    ].join("; ");

    await emitLiveOrderSubmitFailed(uid, request, safeMessage, durable.attempt.brokerClientOrderId);

    return {
      mode: "live",
      exchange: "bingx",
      symbol: normalizeSymbol(request.symbol),
      side: request.side,
      type: "limit",
      orderSubmitted: false,
      clientOrderId: durable.attempt.brokerClientOrderId,
      status: "failed",
      blockers: [safeMessage],
      warnings: [],
      estimate,
      message: "LIVE ORDER FAILED",
    };
  }
}
