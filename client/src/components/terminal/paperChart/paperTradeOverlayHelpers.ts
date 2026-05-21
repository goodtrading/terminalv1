import type { PaperPositionSnapshot } from "../execution/executionTypes";
import type { PaperChartTradeOverlay } from "./paperTradeOverlayTypes";

export function mapPaperChartOverlay(
  position: PaperPositionSnapshot | null | undefined,
  unrealizedPnlUsdt: number | undefined,
): PaperChartTradeOverlay | null {
  if (!position || position.side === "flat" || position.quantity <= 0) {
    return null;
  }
  if (position.entryPrice == null || !Number.isFinite(position.entryPrice)) {
    return null;
  }
  return {
    symbol: position.symbol,
    side: position.side,
    quantity: position.quantity,
    entryPrice: position.entryPrice,
    stopLoss:
      position.stopLoss != null && Number.isFinite(position.stopLoss)
        ? position.stopLoss
        : null,
    takeProfit:
      position.takeProfit != null && Number.isFinite(position.takeProfit)
        ? position.takeProfit
        : null,
    markPrice:
      position.markPrice != null && Number.isFinite(position.markPrice)
        ? position.markPrice
        : null,
    unrealizedPnlUsdt: Number.isFinite(unrealizedPnlUsdt)
      ? unrealizedPnlUsdt!
      : Number.isFinite(position.unrealizedPnl)
        ? position.unrealizedPnl
        : 0,
    status: "open",
    tradeId: null,
  };
}

export function formatOverlayPrice(price: number): string {
  return price.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function snapOverlayPrice(price: number): number {
  return Math.round(price * 100) / 100;
}

const RISK_OFFSET_RATIO = 0.003;

export function defaultPaperStopLoss(
  side: "long" | "short",
  entryPrice: number,
): number {
  const distance = entryPrice * RISK_OFFSET_RATIO;
  return snapOverlayPrice(side === "long" ? entryPrice - distance : entryPrice + distance);
}

export function defaultPaperTakeProfit(
  side: "long" | "short",
  entryPrice: number,
): number {
  const distance = entryPrice * RISK_OFFSET_RATIO;
  return snapOverlayPrice(side === "long" ? entryPrice + distance : entryPrice - distance);
}

export function formatPnlUsdt(pnl: number): string {
  const sign = pnl >= 0 ? "+" : "";
  return `${sign}${pnl.toFixed(2)} USDT`;
}

/** Fallback fee/slippage bps when paper settings are not loaded yet. */
export const DEFAULT_PAPER_CHART_FEE_DEFAULTS = {
  makerFeeBps: 2,
  takerFeeBps: 5,
  slippageBps: 1,
} as const;

export const DEFAULT_PAPER_ACCOUNT_BASE_USDT = 10_000;

export type PaperChartFeeSettings = {
  makerFeeBps: number;
  takerFeeBps: number;
  slippageBps: number;
};

export function resolvePaperChartFeeBps(
  settings?: Partial<PaperChartFeeSettings> | null,
): PaperChartFeeSettings {
  const d = DEFAULT_PAPER_CHART_FEE_DEFAULTS;
  const maker = Number(settings?.makerFeeBps);
  const taker = Number(settings?.takerFeeBps);
  const slip = Number(settings?.slippageBps);
  return {
    makerFeeBps: Number.isFinite(maker) && maker >= 0 ? maker : d.makerFeeBps,
    takerFeeBps: Number.isFinite(taker) && taker >= 0 ? taker : d.takerFeeBps,
    slippageBps: Number.isFinite(slip) && slip >= 0 ? slip : d.slippageBps,
  };
}

export function resolvePaperAccountBaseUsdt(
  account?: { equityUsdt?: number; balanceUsdt?: number } | null,
): number {
  const equity = account?.equityUsdt;
  if (Number.isFinite(equity) && equity > 0) return equity;
  const balance = account?.balanceUsdt;
  if (Number.isFinite(balance) && balance > 0) return balance;
  return DEFAULT_PAPER_ACCOUNT_BASE_USDT;
}

export type PaperRiskLevelNetResult = {
  grossPnlUsdt: number;
  estimatedFeesUsdt: number;
  estimatedSlippageUsdt: number;
  netPnlUsdt: number;
  accountPct: number;
};

export function calculatePaperRiskLevelNetPnl(params: {
  side: "long" | "short";
  entryPrice: number;
  levelPrice: number;
  quantity: number;
  accountEquityUsdt: number;
  takerFeeBps: number;
  slippageBps?: number;
}): PaperRiskLevelNetResult | null {
  const {
    side,
    entryPrice,
    levelPrice,
    quantity,
    accountEquityUsdt,
    takerFeeBps,
    slippageBps = 0,
  } = params;

  if (!Number.isFinite(entryPrice) || entryPrice <= 0) return null;
  if (!Number.isFinite(levelPrice) || levelPrice <= 0) return null;
  if (!Number.isFinite(quantity) || quantity <= 0) return null;
  if (!Number.isFinite(accountEquityUsdt) || accountEquityUsdt <= 0) return null;

  const grossPnl =
    side === "long"
      ? (levelPrice - entryPrice) * quantity
      : (entryPrice - levelPrice) * quantity;

  const entryNotional = entryPrice * quantity;
  const exitNotional = levelPrice * quantity;
  const feeBps = Number.isFinite(takerFeeBps) && takerFeeBps >= 0 ? takerFeeBps : 0;
  const slipBps = Number.isFinite(slippageBps) && slippageBps >= 0 ? slippageBps : 0;

  const estimatedFeesUsdt = ((entryNotional + exitNotional) * feeBps) / 10_000;
  const estimatedSlippageUsdt = (exitNotional * slipBps) / 10_000;
  const netPnlUsdt = grossPnl - estimatedFeesUsdt - estimatedSlippageUsdt;
  const accountPct = (netPnlUsdt / accountEquityUsdt) * 100;

  if (
    !Number.isFinite(grossPnl) ||
    !Number.isFinite(estimatedFeesUsdt) ||
    !Number.isFinite(estimatedSlippageUsdt) ||
    !Number.isFinite(netPnlUsdt) ||
    !Number.isFinite(accountPct)
  ) {
    return null;
  }

  const round2 = (n: number) => Math.round(n * 100) / 100;
  const roundPct = (n: number) => Math.round(n * 1000) / 1000;

  return {
    grossPnlUsdt: round2(grossPnl),
    estimatedFeesUsdt: round2(estimatedFeesUsdt),
    estimatedSlippageUsdt: round2(estimatedSlippageUsdt),
    netPnlUsdt: round2(netPnlUsdt),
    accountPct: roundPct(accountPct),
  };
}

export function formatSignedUsd(value: number): string {
  if (!Number.isFinite(value)) return "—";
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}$`;
}

export function formatSignedPct(value: number): string | null {
  if (!Number.isFinite(value)) return null;
  const sign = value >= 0 ? "+" : "";
  const abs = Math.abs(value);
  const decimals = abs < 0.1 ? 3 : 2;
  return `${sign}${value.toFixed(decimals)}%`;
}

export function buildRiskLevelNetMetrics(
  side: "long" | "short",
  entryPrice: number,
  quantity: number,
  levelPrice: number,
  accountEquityUsdt: number,
  feeSettings: PaperChartFeeSettings,
): { netPnlUsdt: number | null; accountPct: number | null } {
  const net = calculatePaperRiskLevelNetPnl({
    side,
    entryPrice,
    levelPrice,
    quantity,
    accountEquityUsdt,
    takerFeeBps: feeSettings.takerFeeBps,
    slippageBps: feeSettings.slippageBps,
  });
  if (!net) return { netPnlUsdt: null, accountPct: null };
  return { netPnlUsdt: net.netPnlUsdt, accountPct: net.accountPct };
}

export function formatQtyBtc(qty: number): string {
  if (qty >= 1) return qty.toFixed(4);
  if (qty >= 0.01) return qty.toFixed(5);
  return qty.toFixed(6);
}

export type RiskPlacementTarget = "stopLoss" | "takeProfit";

/** Initial preview anchor when entering placement (not auto-saved). */
export function initialPlacementPreviewPrice(
  side: "long" | "short",
  entryPrice: number,
  target: RiskPlacementTarget,
): number {
  return target === "stopLoss"
    ? defaultPaperStopLoss(side, entryPrice)
    : defaultPaperTakeProfit(side, entryPrice);
}

export function validateChartPlacement(
  side: "long" | "short",
  entryPrice: number,
  target: RiskPlacementTarget,
  price: number,
): string | null {
  if (!Number.isFinite(entryPrice) || entryPrice <= 0) return null;
  if (target === "stopLoss") {
    if (side === "long" && price >= entryPrice) {
      return "For a long, SL must be below entry.";
    }
    if (side === "short" && price <= entryPrice) {
      return "For a short, SL must be above entry.";
    }
  } else {
    if (side === "long" && price <= entryPrice) {
      return "For a long, TP must be above entry.";
    }
    if (side === "short" && price >= entryPrice) {
      return "For a short, TP must be below entry.";
    }
  }
  return null;
}
