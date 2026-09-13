import { PAPER_COST_POLICY } from "@shared/trading/paperCostPolicy";
import type { PaperState } from "@/lib/paperState";

export type ExitEstimate = { feeBps: number; slippageBps: number };
// Presentation assumptions only; never used for executed fills or accounting.
export const DEFAULT_EXIT_ESTIMATE: ExitEstimate = { feeBps: PAPER_COST_POLICY.takerFeeBps, slippageBps: PAPER_COST_POLICY.slippageBps };
export type CanonicalNetPnl = {
  mode: "open" | "closed" | "unavailable";
  gross: number | null;
  actualFees: number | null;
  estimatedExitFee: number | null;
  estimatedExitSlippage: number | null;
  net: number | null;
  netPct: number | null;
  reason: string | null;
};
type Input = Pick<PaperState, "active" | "backend" | "resources" | "position" | "account" | "fills">;
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const empty = (reason: string): CanonicalNetPnl => ({ mode: "unavailable", gross: null, actualFees: null, estimatedExitFee: null, estimatedExitSlippage: null, net: null, netPct: null, reason });

/** Presentation-only position return; the denominator is entry notional. */
export function calculateNetPositionPct(
  netPnl: number | null,
  quantity: number | null | undefined,
  entryPrice: number | null | undefined,
): number | null {
  const entryNotional =
    finite(quantity) && finite(entryPrice)
      ? Math.abs(quantity) * entryPrice
      : null;
  if (netPnl == null || !finite(netPnl) || entryNotional == null || !finite(entryNotional) || entryNotional <= 0) {
    return null;
  }
  return (netPnl / entryNotional) * 100;
}

/** Pure presentation projection. No reads, ledger, matching, or accounting writes. */
export function canonicalNetPnl(state: Input, estimate = DEFAULT_EXIT_ESTIMATE): CanonicalNetPnl {
  if (!state.active || state.backend !== "nautilus" || state.resources.position !== "AVAILABLE") return empty("Canonical position unavailable");
  const position = state.position;
  const open = position != null && position.side !== "flat" && finite(position.quantity) && position.quantity > 0;
  const gross = open ? position.unrealizedPnl : state.resources.account === "AVAILABLE" ? state.account?.realizedPnlUsdt : undefined;
  const result: CanonicalNetPnl = { ...empty("Canonical fills unavailable"), mode: open ? "open" : "closed", gross: finite(gross) ? gross : null };
  const equity = state.resources.account === "AVAILABLE" ? state.account?.equityUsdt : undefined;
  if (open && finite(position.markPrice) && position.markPrice > 0) {
    const notional = position.quantity * position.markPrice;
    result.estimatedExitFee = finite(estimate.feeBps) && estimate.feeBps >= 0 ? notional * estimate.feeBps / 10_000 : null;
    result.estimatedExitSlippage = finite(estimate.slippageBps) && estimate.slippageBps >= 0 ? notional * estimate.slippageBps / 10_000 : null;
  }
  if (state.resources.fills !== "AVAILABLE") return result;
  const unique = new Map<string, Input["fills"][number]>();
  for (const fill of state.fills) {
    const prior = unique.get(fill.fillId);
    if (prior && (prior.quantity !== fill.quantity || prior.side !== fill.side || prior.fee !== fill.fee || prior.feeAsset !== fill.feeAsset || prior.timestamp !== fill.timestamp || prior.instrument !== fill.instrument)) return { ...result, reason: "Conflicting canonical fill identity" };
    unique.set(fill.fillId, fill);
  }
  const fills = [...unique.values()].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
  if (!fills.length) return { ...result, reason: "No executed fills available" };
  const symbol = position?.symbol ?? fills[0].instrument;
  if (fills.some(f => f.instrument !== symbol || !finite(f.quantity) || f.quantity <= 0 || !Number.isFinite(Date.parse(f.timestamp)) || !finite(f.fee) || f.feeAsset !== "USDT")) return { ...result, reason: "Complete USDT fill fees required" };
  let signedQuantity = 0;
  let cycleFees = 0;
  let totalFees = 0;
  let reduced = false;
  const tolerance = 1e-9;
  for (const fill of fills) {
    const delta = fill.side === "buy" ? fill.quantity : -fill.quantity;
    if (Math.abs(signedQuantity) < tolerance) { cycleFees = 0; reduced = false; }
    if (signedQuantity * delta < 0) reduced = true;
    signedQuantity += delta;
    cycleFees += fill.fee!;
    totalFees += fill.fee!;
  }
  const expected = open ? position.quantity * (position.side === "long" ? 1 : -1) : 0;
  if (Math.abs(signedQuantity - expected) > tolerance) return { ...result, reason: "Fills and position not yet aligned" };
  if (open && reduced) return { ...result, reason: "Entry fee attribution unavailable after reduction or reversal" };
  // The account aggregate is a completeness check, never an additional deduction.
  const canonicalFees = state.resources.account === "AVAILABLE" ? state.account?.feesTotal : undefined;
  if (canonicalFees != null && (!Number.isFinite(Number(canonicalFees)) || Math.abs(Number(canonicalFees) - totalFees) > 1e-8)) return { ...result, reason: "Fill fees and account not yet aligned" };
  result.actualFees = open ? cycleFees : totalFees;
  if (result.gross == null) return { ...result, reason: "Canonical PnL unavailable" };
  if (open && (result.estimatedExitFee == null || result.estimatedExitSlippage == null)) return { ...result, reason: "Exit estimate unavailable" };
  result.net = result.gross - result.actualFees - (result.estimatedExitFee ?? 0) - (result.estimatedExitSlippage ?? 0);
  result.netPct = finite(equity) && equity > 0 ? result.net / equity * 100 : null;
  result.reason = null;
  return result;
}

/** Hypothetical close at a protective level, preserving canonical current gross and fill fees. */
export function canonicalNetAtPrice(state: Input, price: number): number | null {
  const p = state.position;
  if (!p || p.side === "flat" || !finite(price) || price <= 0 || !finite(p.markPrice) || !finite(p.unrealizedPnl)) return null;
  const unrealizedPnl = p.unrealizedPnl + (price - p.markPrice) * p.quantity * (p.side === "long" ? 1 : -1);
  return canonicalNetPnl({ ...state, position: { ...p, markPrice: price, unrealizedPnl } }).net;
}
