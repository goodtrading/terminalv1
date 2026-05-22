import { MarketDataGateway } from "../../market-gateway";
import { getFirstConnectedConnectionForUser } from "../exchanges/bingx/bingxCredentialStore";
import { getBingXReadOnlySnapshot } from "../exchanges/bingx/bingxReadOnlyService";
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
  getRiskGuardStatus,
  isDryRunEnabled,
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
  const hasQty = qty != null && Number.isFinite(qty) && qty > 0;
  const hasNotional =
    notional != null && Number.isFinite(notional) && notional > 0;

  if (!hasQty && !hasNotional) {
    blockers.push("quantity or notionalUsdt is required");
  }
  if (qty != null && (!Number.isFinite(qty) || qty <= 0)) {
    blockers.push("quantity must be > 0");
  }
  if (notional != null && (!Number.isFinite(notional) || notional <= 0)) {
    blockers.push("notionalUsdt must be > 0");
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

  if (readinessFull.status === "not_ready" || !readinessFull.readyForDryRun) {
    result.blockers.push(
      ...readinessFull.blockers.slice(0, 8),
      readinessFull.status === "not_ready"
        ? "Live readiness: not_ready"
        : "Live readiness: not ready for dry run",
    );
    result.message = "DRY RUN BLOCKED — risk guard failed";
    await emitLiveOrderPreviewBlocked(uid, request, result);
    return result;
  }

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
  if (request.type === "limit" && request.limitPrice != null) {
    entryPrice = request.limitPrice;
  } else {
    entryPrice = resolveMarkPrice(symbol, markFromPos);
  }

  if (entryPrice == null || !Number.isFinite(entryPrice) || entryPrice <= 0) {
    result.blockers.push("entryPrice unavailable (mark/last price required)");
  }

  const levResolved = resolvePreviewLeverage(request, pos?.leverage);
  result.blockers.push(...levResolved.blockers);
  result.warnings.push(...levResolved.warnings);
  const leverage = levResolved.leverage;

  let quantity = 0;
  let notionalUsdt = 0;

  if (entryPrice != null && entryPrice > 0) {
    if (request.quantity != null && request.quantity > 0) {
      quantity = request.quantity;
      notionalUsdt = quantity * entryPrice;
    } else if (request.notionalUsdt != null && request.notionalUsdt > 0) {
      notionalUsdt = request.notionalUsdt;
      quantity = notionalUsdt / entryPrice;
    }
  }

  quantity = round4(quantity);
  notionalUsdt = round2(notionalUsdt);

  result.estimate.entryPrice = entryPrice != null ? round2(entryPrice) : undefined;
  result.estimate.quantity = quantity;
  result.estimate.notionalUsdt = notionalUsdt;
  result.estimate.leverage = leverage;
  if (notionalUsdt > 0 && leverage > 0) {
    result.estimate.requiredMarginUsdt = round2(notionalUsdt / leverage);
  }

  const feeBps = envNumberLocal("BINGX_ESTIMATED_FEE_BPS", DEFAULT_FEE_BPS);
  const slipBps =
    request.type === "market"
      ? envNumberLocal("BINGX_ESTIMATED_SLIPPAGE_BPS", DEFAULT_SLIPPAGE_BPS_MARKET)
      : 0;
  result.estimate.estimatedFeeUsdt = round2((notionalUsdt * feeBps) / 10_000);
  result.estimate.estimatedSlippageUsdt =
    slipBps > 0 ? round2((notionalUsdt * slipBps) / 10_000) : undefined;

  const maxNotional = getRiskGuardStatus().maxNotionalUsdt;
  if (!isMaxOrderSizeConfigured() || maxNotional == null) {
    result.blockers.push("MAX_ORDER_NOTIONAL_USDT not configured");
  } else if (notionalUsdt > maxNotional) {
    result.blockers.push(
      `Notional ${notionalUsdt} USDT exceeds max ${maxNotional} USDT`,
    );
  }

  const maxAccountRiskPct = envNumberLocal("MAX_ACCOUNT_RISK_PCT", 2);
  if (!isMaxAccountRiskConfigured()) {
    result.blockers.push("MAX_ACCOUNT_RISK_PCT not configured");
  }

  const requireSl = isSlRequiredPolicyConfigured();
  result.risk.requireStopLoss = requireSl;
  if (requireSl && (request.stopLossPrice == null || request.stopLossPrice <= 0)) {
    result.blockers.push("Stop loss required (REQUIRE_SL_ON_LIVE_ORDERS=true)");
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
    result.blockers.push(
      `maxLossAccountPct ${riskMetrics.maxLossAccountPct}% exceeds MAX_ACCOUNT_RISK_PCT ${maxAccountRiskPct}%`,
    );
  }

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
    if (health.overall === "error") {
      result.blockers.push("System health: error");
    } else if (health.bingx.health === "error") {
      result.blockers.push("BingX connection health: error");
    }
  } catch {
    result.warnings.push("System health check skipped");
  }

  if (readinessFull.readyForLive) {
    result.warnings.push(
      "Readiness reports readyForLive — live submit remains disabled in phase 5B.",
    );
  }

  const processEnvMarket = process.env.ALLOW_MARKET_ORDERS;
  if (
    request.type === "market" &&
    processEnvMarket !== "true" &&
    processEnvMarket !== "1"
  ) {
    result.warnings.push(
      "ALLOW_MARKET_ORDERS=false — market orders disabled for live submit (dry-run estimate only).",
    );
  }

  if (request.reduceOnly) {
    result.warnings.push("reduceOnly — preview assumes position reduction only.");
  }

  await emitLiveOrderPreviewRequested(uid, request, notionalUsdt);

  const blocked = result.blockers.length > 0;
  result.blocked = blocked;
  result.validated = !blocked;
  result.risk.riskGuardPassed = !blocked;
  result.message = blocked
    ? "DRY RUN BLOCKED — risk guard failed"
    : "DRY RUN ONLY — ORDER NOT SENT";

  if (blocked) {
    await emitLiveOrderPreviewBlocked(uid, request, result);
  } else {
    await emitLiveOrderPreviewPassed(uid, request, result);
  }

  return result;
}
