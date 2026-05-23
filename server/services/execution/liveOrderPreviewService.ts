import { MarketDataGateway } from "../../market-gateway";
import { getFirstConnectedConnectionForUser } from "../exchanges/bingx/bingxCredentialStore";
import { getBingXReadOnlySnapshot } from "../exchanges/bingx/bingxReadOnlyService";
import {
  formatQuantityForBingX,
  getBingXSymbolRules,
  validateQuantityAgainstRules,
} from "../exchanges/bingx/bingxSymbolRulesService";
import { buildSystemHealthSnapshot } from "../system/systemHealthService";
import {
  emitLiveOrderPreviewBlocked,
  emitLiveOrderPreviewPassed,
  emitLiveOrderPreviewRequested,
} from "../system/liveOrderPreviewAudits";
import { getLiveTradingReadiness } from "./liveTradingReadinessService";
import type {
  LiveOrderPreviewRequest,
  LiveOrderPreviewResult,
  LiveOrderPreviewSide,
  LiveOrderPreviewType,
} from "./liveOrderPreviewTypes";
import {
  buildLiveLockedDryRunWarnings,
  filterDryRunInfraBlockers,
  isLiveOnlyEnvBlocker,
} from "./liveDryRunPolicy";
import {
  getLiveTradingEnvFlags,
  getMaxAccountRiskPct,
  getMaxOrderNotionalUsdt,
  getRiskGuardStatus,
  isBingxMarketOrdersAllowed,
  isDryRunEnabled,
  isLiveLimitTestMode,
  isMaxAccountRiskConfigured,
  isMaxOrderSizeConfigured,
  isSlRequiredPolicyConfigured,
} from "./riskGuard";

function envNumberLocal(key: string, fallback: number): number {
  const v = process.env[key];
  if (v == null || v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

const DEFAULT_FEE_BPS = 5;
const DEFAULT_SLIPPAGE_BPS_MARKET = 2;
const DEFAULT_PREVIEW_LEVERAGE = 5;
const MAX_LEVERAGE_CAP = 125;

function maxLeverageAllowed(): number {
  const configured = getRiskGuardStatus().maxLeverage;
  if (configured != null && configured > 0) {
    return Math.min(configured, MAX_LEVERAGE_CAP);
  }
  return MAX_LEVERAGE_CAP;
}

function resolvePreviewLeverage(
  request: LiveOrderPreviewRequest,
  positionLeverage?: number,
): { leverage: number; blockers: string[]; warnings: string[] } {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const cap = maxLeverageAllowed();

  if (request.leverage != null) {
    if (!Number.isFinite(request.leverage) || Number.isNaN(request.leverage)) {
      blockers.push("Invalid leverage.");
      return { leverage: DEFAULT_PREVIEW_LEVERAGE, blockers, warnings };
    }
    if (request.leverage <= 0) {
      blockers.push("Invalid leverage.");
      return { leverage: DEFAULT_PREVIEW_LEVERAGE, blockers, warnings };
    }
    if (request.leverage > cap) {
      blockers.push(`Leverage ${request.leverage}x exceeds max ${cap}x`);
    }
    if (request.leverage > MAX_LEVERAGE_CAP) {
      warnings.push(`Leverage above BingX typical cap (${MAX_LEVERAGE_CAP}x)`);
    }
    return { leverage: request.leverage, blockers, warnings };
  }

  const fallback =
    positionLeverage != null && positionLeverage > 0
      ? positionLeverage
      : DEFAULT_PREVIEW_LEVERAGE;
  return { leverage: Math.min(fallback, cap), blockers, warnings };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round4(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}

function normalizeSymbol(symbol: string): string {
  return symbol.trim().toUpperCase().replace(/\s+/g, "");
}

function baseResult(
  request: LiveOrderPreviewRequest,
  readiness: LiveOrderPreviewResult["readiness"],
  equity: number | undefined,
): LiveOrderPreviewResult {
  const maxAccountRiskPct = envNumberLocal("MAX_ACCOUNT_RISK_PCT", 2);
  return {
    mode: "dry_run",
    exchange: "bingx",
    symbol: normalizeSymbol(request.symbol),
    side: request.side,
    type: request.type,
    orderWouldBeSent: false,
    tradingLocked: true,
    validated: false,
    blocked: true,
    blockers: [],
    warnings: [],
    estimate: {
      quantity: 0,
      notionalUsdt: 0,
    },
    risk: {
      hasStopLoss: request.stopLossPrice != null && request.stopLossPrice > 0,
      hasTakeProfit: request.takeProfitPrice != null && request.takeProfitPrice > 0,
      accountEquityUsdt: equity,
      maxAccountRiskPct,
      requireStopLoss: isSlRequiredPolicyConfigured(),
      riskGuardPassed: false,
    },
    readiness,
    message: "DRY RUN BLOCKED — risk guard failed",
  };
}

function resolveMarkPrice(
  symbol: string,
  snapshotMark?: number,
): number | null {
  if (snapshotMark != null && Number.isFinite(snapshotMark) && snapshotMark > 0) {
    return snapshotMark;
  }
  const ticker = MarketDataGateway.getCachedTicker();
  if (ticker?.price && Number.isFinite(ticker.price) && ticker.price > 0) {
    return ticker.price;
  }
  void symbol;
  return null;
}

function computeRiskMetrics(
  side: LiveOrderPreviewSide,
  entry: number,
  qty: number,
  equity: number,
  stopLoss?: number,
  takeProfit?: number,
): {
  maxLossUsdt?: number;
  maxLossAccountPct?: number;
  takeProfitGainUsdt?: number;
  takeProfitAccountPct?: number;
} {
  const out: {
    maxLossUsdt?: number;
    maxLossAccountPct?: number;
    takeProfitGainUsdt?: number;
    takeProfitAccountPct?: number;
  } = {};

  if (stopLoss != null && Number.isFinite(stopLoss) && stopLoss > 0) {
    const riskPerUnit =
      side === "buy" ? entry - stopLoss : stopLoss - entry;
    if (riskPerUnit > 0) {
      const loss = riskPerUnit * qty;
      out.maxLossUsdt = round2(loss);
      if (equity > 0) {
        out.maxLossAccountPct = round2((loss / equity) * 100);
      }
    }
  }

  if (takeProfit != null && Number.isFinite(takeProfit) && takeProfit > 0) {
    const rewardPerUnit =
      side === "buy" ? takeProfit - entry : entry - takeProfit;
    if (rewardPerUnit > 0) {
      const gain = rewardPerUnit * qty;
      out.takeProfitGainUsdt = round2(gain);
      if (equity > 0) {
        out.takeProfitAccountPct = round2((gain / equity) * 100);
      }
    }
  }

  return out;
}

function liquidationDistancePct(
  side: LiveOrderPreviewSide,
  entry: number,
  liquidationPrice?: number,
  leverage?: number,
): number | undefined {
  if (
    liquidationPrice != null &&
    Number.isFinite(liquidationPrice) &&
    liquidationPrice > 0 &&
    entry > 0
  ) {
    return round2((Math.abs(entry - liquidationPrice) / entry) * 100);
  }
  const lev = leverage != null && leverage > 0 ? leverage : 10;
  const approxMaint = 100 / lev;
  return round2(Math.max(approxMaint * 0.85, 0.5));
}

function validateRequestShape(
  request: LiveOrderPreviewRequest,
): { ok: true } | { ok: false; blockers: string[] } {
  const blockers: string[] = [];

  if (request.exchange !== "bingx") {
    blockers.push("Only BingX exchange is supported for live dry-run preview.");
  }

  const symbol = request.symbol?.trim();
  if (!symbol) blockers.push("symbol is required");

  if (request.side !== "buy" && request.side !== "sell") {
    blockers.push("side must be buy or sell");
  }

  if (request.type !== "market" && request.type !== "limit") {
    blockers.push("type must be market or limit");
  }

  const qty = request.quantity;
  const notional = request.notionalUsdt;
  const margin = request.marginUsdt;
  const sizingMode = request.sizingMode;
  const hasQty = qty != null && Number.isFinite(qty) && qty > 0;
  const hasNotional =
    notional != null && Number.isFinite(notional) && notional > 0;
  const hasMargin =
    margin != null && Number.isFinite(margin) && margin > 0;

  if (sizingMode === "margin") {
    if (!hasMargin) {
      blockers.push("Margin USDT is required for margin sizing.");
    }
    if (request.leverage == null || !Number.isFinite(request.leverage) || request.leverage <= 0) {
      blockers.push("Leverage is required for margin sizing.");
    }
  } else {
    if (!hasQty && !hasNotional) {
      blockers.push("quantity or notionalUsdt is required");
    }
  }
  if (qty != null && (!Number.isFinite(qty) || qty <= 0)) {
    blockers.push("quantity must be > 0");
  }
  if (notional != null && (!Number.isFinite(notional) || notional <= 0)) {
    blockers.push("notionalUsdt must be > 0");
  }
  if (margin != null && (!Number.isFinite(margin) || margin <= 0)) {
    blockers.push("marginUsdt must be > 0");
  }

  if (request.type === "limit") {
    const lp = request.limitPrice;
    if (lp == null || !Number.isFinite(lp) || lp <= 0) {
      blockers.push("limitPrice is required for limit orders");
    }
  }

  if (request.leverage != null) {
    if (!Number.isFinite(request.leverage) || Number.isNaN(request.leverage)) {
      blockers.push("Invalid leverage.");
    } else if (request.leverage <= 0) {
      blockers.push("Invalid leverage.");
    }
  }

  if (blockers.length > 0) return { ok: false, blockers };
  return { ok: true };
}

export async function previewBingXLiveOrder(
  userId: string | number,
  request: LiveOrderPreviewRequest,
): Promise<LiveOrderPreviewResult> {
  const uid = Math.floor(Number(userId));
  if (!Number.isFinite(uid) || uid <= 0) {
    throw new Error("INVALID_USER_ID");
  }

  let readinessFull: Awaited<ReturnType<typeof getLiveTradingReadiness>> | null =
    null;
  let readinessSummary: LiveOrderPreviewResult["readiness"] = {
    status: "unknown",
    readyForDryRun: false,
    readyForLive: false,
  };

  try {
    readinessFull = await getLiveTradingReadiness(uid, "bingx");
    readinessSummary = {
      status: readinessFull.status,
      readyForDryRun: readinessFull.readyForDryRun,
      readyForLive: readinessFull.readyForLive,
    };
  } catch (err) {
    readinessSummary = {
      status: "unavailable",
      readyForDryRun: false,
      readyForLive: false,
    };
  }

  const conn = getFirstConnectedConnectionForUser(uid);
  let equity: number | undefined;
  const result = baseResult(request, readinessSummary, equity);

  if (!readinessFull) {
    result.blockers.push("Live readiness unavailable.");
    result.readiness = readinessSummary;
    result.message = "DRY RUN BLOCKED — risk guard failed";
    await emitLiveOrderPreviewBlocked(uid, request, result);
    return result;
  }

  const shape = validateRequestShape(request);
  if (!shape.ok) {
    result.blockers.push(...shape.blockers);
    result.message = "DRY RUN BLOCKED — risk guard failed";
    await emitLiveOrderPreviewBlocked(uid, request, result);
    return result;
  }

  if (!isDryRunEnabled()) {
    result.blockers.push("BINGX_ENABLE_DRY_RUN=false");
    result.message = "DRY RUN BLOCKED — risk guard failed";
    await emitLiveOrderPreviewBlocked(uid, request, result);
    return result;
  }

  if (!readinessFull.readyForDryRun) {
    const infraBlockers = filterDryRunInfraBlockers(readinessFull.blockers);
    result.blockers.push(
      ...infraBlockers.slice(0, 8),
      infraBlockers.length === 0
        ? "Live readiness: not ready for dry run"
        : "",
    );
    result.blockers = result.blockers.filter((b) => b.length > 0);
    result.warnings.push(...readinessFull.warnings.slice(0, 6));
    result.message = "DRY RUN BLOCKED — risk guard failed";
    await emitLiveOrderPreviewBlocked(uid, request, result);
    return result;
  }

  result.warnings.push(...buildLiveLockedDryRunWarnings(getLiveTradingEnvFlags()));

  if (!conn) {
    result.blockers.push("No BingX connection");
    await emitLiveOrderPreviewBlocked(uid, request, result);
    return result;
  }

  const symbol = normalizeSymbol(request.symbol);
  const defaultSym =
    process.env.BINGX_DEFAULT_SYMBOL?.trim() || "BTC-USDT";

  let snapshot;
  try {
    snapshot = await getBingXReadOnlySnapshot(conn.id, uid, defaultSym);
  } catch (err) {
    result.blockers.push(
      err instanceof Error ? err.message.slice(0, 120) : "BingX snapshot failed",
    );
    await emitLiveOrderPreviewBlocked(uid, request, result);
    return result;
  }

  if (snapshot.accountSync.status !== "loaded") {
    result.blockers.push("Balance not loaded");
  }

  equity =
    snapshot.account?.equityUsdt ??
    snapshot.account?.balanceUsdt ??
    undefined;
  result.risk.accountEquityUsdt = equity;

  if (equity == null || !Number.isFinite(equity) || equity <= 0) {
    result.blockers.push("Account equity unavailable");
  }

  const pos = snapshot.positions.find(
    (p) =>
      normalizeSymbol(p.symbol) === symbol ||
      normalizeSymbol(p.symbol) === normalizeSymbol(defaultSym),
  );
  const markFromPos =
    pos?.markPrice != null && pos.markPrice > 0 ? pos.markPrice : undefined;

  let entryPrice: number | null = null;
  // Always use market price for entryPrice, never limit price
  entryPrice = resolveMarkPrice(symbol, markFromPos);

  if (entryPrice == null || !Number.isFinite(entryPrice) || entryPrice <= 0) {
    result.blockers.push("entryPrice unavailable (mark/last price required)");
  }

  // Anti-marketable validation for limit orders
  if (request.type === "limit" && request.limitPrice != null && markFromPos != null) {
    const spot = markFromPos;
    const limit = request.limitPrice;

    console.log("[non-marketable-check]", {
      side: request.side,
      limitPrice: limit,
      referencePrice: spot,
      referencePriceSource: "markFromPos",
      stopLossPrice: request.stopLossPrice,
      takeProfitPrice: request.takeProfitPrice,
    });

    let nonMarketableValid = true;
    let nonMarketableBlocker: string | undefined;

    if (request.side === "sell") {
      // SELL LIMIT must be ABOVE spot to not be marketable
      if (limit <= spot) {
        nonMarketableValid = false;
        nonMarketableBlocker = `SELL LIMIT ${limit} is marketable at reference ${spot}. Use price above spot.`;
        result.blockers.push(nonMarketableBlocker);
      }
    } else if (request.side === "buy") {
      // BUY LIMIT must be BELOW spot to not be marketable
      if (limit >= spot) {
        nonMarketableValid = false;
        nonMarketableBlocker = `BUY LIMIT ${limit} is marketable at reference ${spot}. Use price below spot.`;
        result.blockers.push(nonMarketableBlocker);
      }
    }

    // Add non-marketable check metadata to response
    result.nonMarketableCheck = {
      side: request.side,
      limitPrice: limit,
      referencePrice: spot,
      referencePriceSource: "markFromPos",
      valid: nonMarketableValid,
      blocker: nonMarketableBlocker,
    };
  }

  const levResolved = resolvePreviewLeverage(request, pos?.leverage);
  result.blockers.push(...levResolved.blockers);
  result.warnings.push(...levResolved.warnings);
  const leverage = levResolved.leverage;

  let quantity = 0;
  let notionalUsdt = 0;
  let rawQuantity = 0;
  let normalizedQuantity = 0;
  let symbolRules: Awaited<ReturnType<typeof getBingXSymbolRules>> | null = null;
  let effectiveMarginUsdt = 0;

  // Calculate notional based on sizing mode
  if (entryPrice != null && entryPrice > 0) {
    if (request.quantity != null && request.quantity > 0) {
      quantity = request.quantity;
      notionalUsdt = quantity * entryPrice;
    } else if (request.sizingMode === "margin" && request.marginUsdt != null && request.marginUsdt > 0) {
      // Margin mode: notional = margin * leverage
      effectiveMarginUsdt = request.marginUsdt;
      const lev = leverage > 0 ? leverage : 1;
      notionalUsdt = effectiveMarginUsdt * lev;
      quantity = notionalUsdt / entryPrice;
      result.warnings.push(`Margin mode: ${effectiveMarginUsdt.toFixed(2)} USDT × ${lev}x = ${notionalUsdt.toFixed(2)} USDT notional.`);
    } else if (request.notionalUsdt != null && request.notionalUsdt > 0) {
      // Notional mode (default)
      notionalUsdt = request.notionalUsdt;
      quantity = notionalUsdt / entryPrice;
    }
  }

  rawQuantity = quantity;

  const testMode = isLiveLimitTestMode();

  console.log("[5C-debug] previewBingXLiveOrder", {
    testMode,
    envValue: process.env.BINGX_LIVE_LIMIT_TEST_MODE,
    maxOrderNotional: process.env.MAX_ORDER_NOTIONAL_USDT,
    symbol,
  });

  // Fetch and apply BingX symbol rules for quantity normalization
  try {
    symbolRules = await getBingXSymbolRules(symbol);
    const validation = validateQuantityAgainstRules(quantity, entryPrice ?? 0, symbolRules);

    // Include symbol rules in result for UI display
    result.symbolRules = {
      symbol: symbolRules.symbol,
      minQty: symbolRules.minQty,
      maxQty: symbolRules.maxQty,
      stepSize: symbolRules.stepSize,
      quantityPrecision: symbolRules.quantityPrecision,
      pricePrecision: symbolRules.pricePrecision,
      minNotional: symbolRules.minNotional,
      available: true,
    };

    if (!validation.valid) {
      if (testMode) {
        // In test mode, warn but allow submit - BingX will validate
        result.warnings.push(`Quantity validation warning: ${validation.error || "Quantity validation failed"}. BingX will validate on submit.`);
      } else {
        result.blockers.push(validation.error || "Quantity validation failed");
        if (validation.requiredMinNotional != null) {
          const maxNotional = getMaxOrderNotionalUsdt();
          if (maxNotional != null && validation.requiredMinNotional > maxNotional) {
            if (testMode) {
              result.warnings.push(
                `BingX minimum order size (${validation.requiredMinNotional.toFixed(2)} USDT) is above current MAX_ORDER_NOTIONAL_USDT (${maxNotional} USDT). Ignored in test mode.`
              );
            } else {
              result.blockers.push(
                `BingX minimum order size (${validation.requiredMinNotional.toFixed(2)} USDT) is above current MAX_ORDER_NOTIONAL_USDT (${maxNotional} USDT). Increase risk limit intentionally or choose another symbol.`
              );
            }
          } else {
            if (request.sizingMode === "margin" && effectiveMarginUsdt > 0) {
              const requiredMargin = validation.requiredMinNotional / leverage;
              result.warnings.push(
                `Minimum BTC-USDT size requires approx ${validation.requiredMinNotional.toFixed(2)} USDT notional, or ${requiredMargin.toFixed(2)} USDT margin at ${leverage}x.`
              );
            } else {
              result.warnings.push(
                `Increase notional to at least ${validation.requiredMinNotional.toFixed(2)} USDT for ${symbol}.`
              );
            }
          }
        }
      }
    } else {
      normalizedQuantity = validation.normalizedQty ?? quantity;
    }
    quantity = normalizedQuantity;
    notionalUsdt = quantity * (entryPrice ?? 0);
  } catch (err) {
    // If symbol rules fetch fails, block live submit but allow dry-run estimation
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.warn("[live-preview] symbol rules fetch failed", {
      symbol,
      error: errorMsg,
    });
    if (testMode) {
      result.warnings.push("Symbol rules unavailable — BingX will validate quantity.");
    } else {
      result.warnings.push(`Symbol rules unavailable — live submit disabled. Error: ${errorMsg}`);
      result.blockers.push("Live submit blocked: BingX symbol rules unavailable.");
    }
    result.symbolRules = {
      symbol,
      minQty: 0,
      maxQty: 0,
      stepSize: 0,
      quantityPrecision: 0,
      pricePrecision: 0,
      minNotional: 0,
      available: false,
    };
  }

  quantity = round4(quantity);
  notionalUsdt = round2(notionalUsdt);

  result.estimate.entryPrice = entryPrice != null ? round2(entryPrice) : undefined;
  result.estimate.quantity = quantity;
  result.estimate.notionalUsdt = notionalUsdt;
  result.estimate.leverage = leverage;
  result.estimate.rawQuantity = round4(rawQuantity);
  result.estimate.normalizedQuantity = round4(normalizedQuantity);
  result.estimate.minQuantity = symbolRules?.minQty;
  result.estimate.requiredMinNotional = symbolRules ? round2(symbolRules.minQty * (entryPrice ?? 0)) : undefined;
  if (notionalUsdt > 0 && leverage > 0) {
    result.estimate.requiredMarginUsdt = round2(notionalUsdt / leverage);
  }

  // Set test mode flag in result
  result.liveLimitTestMode = testMode;

  const feeBps = envNumberLocal("BINGX_ESTIMATED_FEE_BPS", DEFAULT_FEE_BPS);
  const slipBps =
    request.type === "market"
      ? envNumberLocal("BINGX_ESTIMATED_SLIPPAGE_BPS", DEFAULT_SLIPPAGE_BPS_MARKET)
      : 0;
  result.estimate.estimatedFeeUsdt = round2((notionalUsdt * feeBps) / 10_000);
  result.estimate.estimatedSlippageUsdt =
    slipBps > 0 ? round2((notionalUsdt * slipBps) / 10_000) : undefined;

  const maxNotional = getMaxOrderNotionalUsdt();

  if (!isMaxOrderSizeConfigured() || maxNotional == null) {
    if (testMode) {
      result.warnings.push("Max notional guard ignored in live limit test mode.");
    } else {
      result.blockers.push("Max order size not configured (MAX_ORDER_NOTIONAL_USDT)");
    }
  } else if (notionalUsdt > maxNotional) {
    if (testMode) {
      result.warnings.push(`Max notional guard ignored in live limit test mode (${notionalUsdt.toFixed(2)} USDT > ${maxNotional} USDT).`);
    } else {
      if (request.sizingMode === "margin" && effectiveMarginUsdt > 0) {
        result.blockers.push(
          `Effective notional ${notionalUsdt.toFixed(2)} USDT (from ${effectiveMarginUsdt.toFixed(2)} USDT margin × ${leverage}x) exceeds MAX_ORDER_NOTIONAL_USDT (${maxNotional} USDT). Increase risk limit intentionally or reduce margin.`
        );
      } else {
        result.blockers.push(
          `Max order size exceeded (${notionalUsdt.toFixed(2)} USDT > ${maxNotional} USDT)`,
        );
      }
    }
  }

  const maxAccountRiskPct = getMaxAccountRiskPct() ?? envNumberLocal("MAX_ACCOUNT_RISK_PCT", 1);
  if (!isMaxAccountRiskConfigured()) {
    if (testMode) {
      result.warnings.push("Account risk guard warning only in live limit test mode.");
    } else {
      result.blockers.push("Max account risk not configured (MAX_ACCOUNT_RISK_PCT)");
    }
  }

  const requireSl = isSlRequiredPolicyConfigured();
  result.risk.requireStopLoss = requireSl;
  if (requireSl && (request.stopLossPrice == null || request.stopLossPrice <= 0)) {
    if (testMode) {
      result.warnings.push("SL not required for pending limit test. Manage manually on BingX.");
    } else {
      result.blockers.push("Stop loss required");
    }
  }

  const riskMetrics =
    entryPrice != null && equity != null && equity > 0
      ? computeRiskMetrics(
          request.side,
          entryPrice,
          quantity,
          equity,
          request.stopLossPrice,
          request.takeProfitPrice,
        )
      : {};

  Object.assign(result.estimate, riskMetrics);

  if (
    riskMetrics.maxLossAccountPct != null &&
    isMaxAccountRiskConfigured() &&
    riskMetrics.maxLossAccountPct > maxAccountRiskPct
  ) {
    const testMode = isLiveLimitTestMode();
    const message = `Max account risk exceeded (${riskMetrics.maxLossAccountPct}% > ${maxAccountRiskPct}%)`;
    if (testMode) {
      result.warnings.push(`${message} — ignored in test mode`);
    } else {
      result.blockers.push(message);
    }
  }

  result.blockers = result.blockers.filter((b) => !isLiveOnlyEnvBlocker(b));

  if (entryPrice != null) {
    result.estimate.liquidationDistancePct = liquidationDistancePct(
      request.side,
      entryPrice,
      pos?.liquidationPrice,
      leverage,
    );
  }

  try {
    const health = await buildSystemHealthSnapshot(
      uid,
      defaultSym,
    );

    // Build specific blockers instead of generic "System health: error"
    const healthBlockers: string[] = [];

    // Market data health - only block if completely unavailable for entry estimate
    if (!health.marketData.tickerFresh && entryPrice == null) {
      healthBlockers.push("Market data health error: ticker unavailable for entry estimate");
    } else if (!health.marketData.tickerFresh) {
      result.warnings.push("Market data health degraded: ticker stale");
    }

    // BingX health - block only on fatal errors
    if (health.bingx.health === "error") {
      healthBlockers.push("BingX health error: connection fatal error");
    } else if (health.bingx.health === "degraded") {
      result.warnings.push("BingX health degraded: high latency or sync issues");
    }

    // Security guard - block only on kill switch
    if (health.securityGuard.liveTradingEnabled && !health.securityGuard.tradingLocked) {
      // This is expected for live trading, not a blocker for dry-run preview
    }

    // Live trading readiness - block only if not ready for dry-run
    if (health.liveTrading.status === "not_ready" && !health.liveTrading.readyForDryRun) {
      healthBlockers.push("Live readiness error: not ready for dry run");
    }

    // Risk mirror - block only on error status
    if (health.riskMirror.status === "error") {
      healthBlockers.push("Risk mirror health error: " + (health.riskMirror.message || "unknown error"));
    }

    // Add specific health blockers to result
    result.blockers.push(...healthBlockers);

    // Add system health metadata to response
    result.systemHealth = {
      overallStatus: health.overall,
      marketDataStatus: health.marketData.tickerFresh ? "healthy" : "degraded",
      bingxStatus: (health.bingx.health as "healthy" | "degraded" | "error" | "unknown") ?? "unknown",
      securityGuardStatus: health.securityGuard.tradingLocked ? "healthy" : "degraded",
      liveTradingStatus: health.liveTrading.readyForDryRun ? "healthy" : "error",
      blockers: healthBlockers,
    };
  } catch {
    result.warnings.push("System health check skipped");
  }

  if (!getLiveTradingEnvFlags().orderSubmitEnabled) {
    result.warnings.push("Live order submit disabled by design.");
  }

  if (request.type === "market") {
    if (isBingxMarketOrdersAllowed()) {
      result.warnings.push(
        "BINGX_ALLOW_MARKET_ORDERS=true — live market submit blocked in this phase.",
      );
    } else {
      result.warnings.push(
        "Live market orders are disabled in this phase. Use limit orders only.",
      );
    }
  }

  if (request.reduceOnly) {
    result.warnings.push("reduceOnly — preview assumes position reduction only.");
  }

  await emitLiveOrderPreviewRequested(uid, request, notionalUsdt);

  // Final filter for test mode: remove artificial blockers, move to warnings
  if (testMode) {
    const originalBlockers = [...result.blockers];
    result.blockers = originalBlockers.filter((b) => {
      const lowerB = b.toLowerCase();
      const artificialPatterns = [
        "max account risk",
        "account risk",
        "max_order_notional",
        "effective notional",
        "stop loss",
        "sl",
        "symbol rules",
        "quantity validation",
        "minqty",
        "minnotional",
        "risk cap",
        "internal risk",
        "risk guard",
        "bingx minimum order size",
      ];
      return !artificialPatterns.some((pattern) => lowerB.includes(pattern));
    });

    const movedToWarnings = originalBlockers.filter((b) => {
      const lowerB = b.toLowerCase();
      const artificialPatterns = [
        "max account risk",
        "account risk",
        "max_order_notional",
        "effective notional",
        "stop loss",
        "sl",
        "symbol rules",
        "quantity validation",
        "minqty",
        "minnotional",
        "risk cap",
        "internal risk",
        "risk guard",
        "bingx minimum order size",
      ];
      return artificialPatterns.some((pattern) => lowerB.includes(pattern));
    });

    result.warnings.push(...movedToWarnings.map((b) => `[test mode warning] ${b}`));
  }

  const blocked = result.blockers.length > 0;
  result.blocked = blocked;
  result.validated = !blocked;
  result.risk.riskGuardPassed = !blocked;
  result.message = blocked
    ? "DRY RUN BLOCKED — risk guard failed"
    : "DRY RUN ONLY — ORDER NOT SENT";

  // Add debug info for test mode
  result.debug = {
    liveLimitTestMode: testMode,
    envValue: process.env.BINGX_LIVE_LIMIT_TEST_MODE,
    maxOrderNotional: process.env.MAX_ORDER_NOTIONAL_USDT,
  };

  if (blocked) {
    await emitLiveOrderPreviewBlocked(uid, request, result);
  } else {
    await emitLiveOrderPreviewPassed(uid, request, result);
  }

  return result;
}
