/**
 * Shared risk-level PnL metrics for Paper and BingX read-only chart overlays.
 */

export const DEFAULT_CHART_FEE_DEFAULTS = {
  makerFeeBps: 2,
  takerFeeBps: 5,
  slippageBps: 1,
} as const;

export const DEFAULT_ACCOUNT_BASE_USDT = 10_000;

export type ChartFeeSettings = {
  makerFeeBps: number;
  takerFeeBps: number;
  slippageBps: number;
};

export function resolveChartFeeBps(
  settings?: Partial<ChartFeeSettings> | null,
): ChartFeeSettings {
  const d = DEFAULT_CHART_FEE_DEFAULTS;
  const maker = Number(settings?.makerFeeBps);
  const taker = Number(settings?.takerFeeBps);
  const slip = Number(settings?.slippageBps);
  return {
    makerFeeBps: Number.isFinite(maker) && maker >= 0 ? maker : d.makerFeeBps,
    takerFeeBps: Number.isFinite(taker) && taker >= 0 ? taker : d.takerFeeBps,
    slippageBps: Number.isFinite(slip) && slip >= 0 ? slip : d.slippageBps,
  };
}

export function resolveAccountEquityUsdt(
  account?: { equityUsdt?: number; balanceUsdt?: number } | null,
): number {
  const equity = account?.equityUsdt;
  if (Number.isFinite(equity) && equity! > 0) return equity!;
  const balance = account?.balanceUsdt;
  if (Number.isFinite(balance) && balance! > 0) return balance!;
  return DEFAULT_ACCOUNT_BASE_USDT;
}

export type RiskLevelNetResult = {
  grossPnlUsdt: number;
  estimatedFeesUsdt: number;
  estimatedSlippageUsdt: number;
  netPnlUsdt: number;
  accountPct: number;
};

export function calculateRiskLevelNetPnl(params: {
  side: "long" | "short";
  entryPrice: number;
  levelPrice: number;
  quantity: number;
  accountEquityUsdt: number;
  takerFeeBps: number;
  slippageBps?: number;
}): RiskLevelNetResult | null {
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

export type RiskLevelNetMetricsDisplay = {
  netPnlUsdt: number | null;
  accountPct: number | null;
};

/** Fresh empty metrics per render (avoids shared-object mutation). */
export function createEmptyRiskLevelMetrics(): RiskLevelNetMetricsDisplay {
  return {
    netPnlUsdt: null,
    accountPct: null,
  };
}

/** Frozen singleton for modules that need a stable empty reference. */
export const EMPTY_RISK_LEVEL_NET_METRICS: RiskLevelNetMetricsDisplay = Object.freeze(
  createEmptyRiskLevelMetrics(),
);

export function buildRiskLevelNetMetrics(
  side: "long" | "short",
  entryPrice: number,
  quantity: number,
  levelPrice: number,
  accountEquityUsdt: number,
  feeSettings: ChartFeeSettings,
): RiskLevelNetMetricsDisplay {
  const net = calculateRiskLevelNetPnl({
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

export function formatOverlayPrice(price: number): string {
  return price.toLocaleString("en-US", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}
