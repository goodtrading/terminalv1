import type { PaperPositionSnapshot } from "./executionTypes";
import { normalizePaperQuantity } from "../paperChart/normalizePaperQuantity";

function finiteNumber(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  return n;
}

function finitePositive(value: unknown): number | null {
  const n = finiteNumber(value);
  return n != null && n > 0 ? n : null;
}

/** USDT amounts — safe for null/undefined API fields. */
export function formatUSDT(value: unknown): string {
  const n = finiteNumber(value);
  if (n == null) return "—";
  return `${n.toFixed(2)} USDT`;
}

/** Price display (no suffix). */
export function formatPrice(value: unknown): string {
  const n = finitePositive(value);
  if (n == null) return "—";
  return n.toFixed(2);
}

/** BTC quantity display. */
export function formatQtyBtc(value: unknown): string {
  const qty = finitePositive(value);
  if (qty == null) return "—";
  if (qty >= 1) return qty.toFixed(4);
  if (qty >= 0.01) return qty.toFixed(5);
  return qty.toFixed(6);
}

export type NormalizedPaperPositionDisplay = {
  side: PaperPositionSnapshot["side"];
  symbol: string;
  qtyBTC: number | null;
  notionalUSDT: number | null;
  entryPrice: number | null;
  markPrice: number | null;
  unrealizedPnl: number | null;
  realizedPnl: number | null;
  leverage: number | null;
};

type PaperPositionRaw = PaperPositionSnapshot &
  Record<string, unknown> & {
    unrealizedPnL?: unknown;
    realizedPnL?: unknown;
    uPnl?: unknown;
    pnl?: unknown;
    paperUnrealizedPnL?: unknown;
    paperRealizedPnL?: unknown;
    qty?: unknown;
    qtyBTC?: unknown;
    size?: unknown;
  };

/** Normalize mixed legacy/new paper position shapes for UI. */
export function normalizePaperPositionDisplay(
  position: PaperPositionSnapshot | null | undefined,
): NormalizedPaperPositionDisplay | null {
  if (!position || position.side === "flat") return null;

  const raw = position as PaperPositionRaw;
  const entryPrice = finitePositive(
    raw.entryPrice ?? raw.entry ?? raw.price,
  );
  const markPrice = finitePositive(
    raw.markPrice ?? raw.mark ?? entryPrice,
  );

  const { qtyBTC, notionalUSDT } = normalizePaperQuantity(
    {
      qtyBTC: raw.qtyBTC,
      qty: raw.qty,
      quantity: raw.quantity,
      size: raw.size,
      notionalUSDT: raw.notionalUSDT ?? raw.notionalUsdt,
      entryPrice,
    },
    entryPrice,
  );

  const unrealizedPnl = finiteNumber(
    raw.unrealizedPnl ??
      raw.unrealizedPnL ??
      raw.uPnl ??
      raw.pnl ??
      raw.paperUnrealizedPnL,
  );

  const realizedPnl = finiteNumber(
    raw.realizedPnl ?? raw.realizedPnL ?? raw.paperRealizedPnL,
  );

  return {
    side: position.side,
    symbol: String(raw.symbol ?? "BTC-USDT"),
    qtyBTC,
    notionalUSDT,
    entryPrice,
    markPrice,
    unrealizedPnl,
    realizedPnl,
    leverage: finitePositive(raw.leverage),
  };
}

export function pnlColorClass(value: unknown): string {
  const n = finiteNumber(value);
  if (n == null || n === 0) return "text-slate-400";
  return n > 0 ? "text-emerald-400" : "text-red-400";
}
