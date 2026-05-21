export const DEFAULT_RISK_FEE_BPS = {
  makerFeeBps: 2,
  takerFeeBps: 5,
  slippageBps: 1,
} as const;

export function calculateRiskLevelNetPnl(params: {
  side: "long" | "short";
  entryPrice: number;
  levelPrice: number;
  quantity: number;
  accountEquityUsdt: number;
  takerFeeBps?: number;
  slippageBps?: number;
}): { netPnlUsdt: number; accountPct: number } | null {
  const {
    side,
    entryPrice,
    levelPrice,
    quantity,
    accountEquityUsdt,
    takerFeeBps = DEFAULT_RISK_FEE_BPS.takerFeeBps,
    slippageBps = DEFAULT_RISK_FEE_BPS.slippageBps,
  } = params;

  if (entryPrice <= 0 || levelPrice <= 0 || quantity <= 0 || accountEquityUsdt <= 0) {
    return null;
  }

  const grossPnl =
    side === "long"
      ? (levelPrice - entryPrice) * quantity
      : (entryPrice - levelPrice) * quantity;

  const entryNotional = entryPrice * quantity;
  const exitNotional = levelPrice * quantity;
  const estimatedFeesUsdt = ((entryNotional + exitNotional) * takerFeeBps) / 10_000;
  const estimatedSlippageUsdt = (exitNotional * slippageBps) / 10_000;
  const netPnlUsdt = grossPnl - estimatedFeesUsdt - estimatedSlippageUsdt;
  const accountPct = (netPnlUsdt / accountEquityUsdt) * 100;

  if (!Number.isFinite(netPnlUsdt) || !Number.isFinite(accountPct)) return null;

  return {
    netPnlUsdt: Math.round(netPnlUsdt * 100) / 100,
    accountPct: Math.round(accountPct * 1000) / 1000,
  };
}
