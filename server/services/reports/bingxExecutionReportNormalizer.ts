import type { BingXNormalizedPosition } from "../exchanges/bingx/bingxReadOnlyService";
import type { BingXNormalizedRiskOrder } from "../exchanges/bingx/bingxRiskOrders";
import { pickPrimaryRiskOrders } from "../exchanges/bingx/bingxRiskOrders";
import type { TradeReviewRow } from "./executionReportTypes";
import type { BingxRawFillRow } from "./bingxExecutionHistory";

function coerceNum(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim()) {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function formatTime(ts: unknown): string {
  if (typeof ts === "number" && ts > 1e12) {
    return new Date(ts).toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  }
  if (typeof ts === "string" && ts) {
    try {
      const d = new Date(ts);
      if (!Number.isNaN(d.getTime())) {
        return d.toLocaleTimeString("en-GB", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        });
      }
    } catch {
      return ts.slice(11, 16) || ts;
    }
  }
  return "—";
}

function sideFromRaw(row: Record<string, unknown>): "Long" | "Short" {
  const s = String(row.side ?? row.positionSide ?? row.direction ?? "").toLowerCase();
  if (s.includes("short") || s.includes("sell")) return "Short";
  return "Long";
}

export function resolveRiskPrices(
  pos: BingXNormalizedPosition,
  riskOrders: BingXNormalizedRiskOrder[],
  symbol: string,
): { stopLoss?: number; takeProfit?: number } {
  const scoped = riskOrders.filter(
    (r) =>
      !r.symbol ||
      r.symbol.replace(/_/g, "-").toUpperCase() ===
        symbol.replace(/_/g, "-").toUpperCase(),
  );
  const { stopLoss: slOrder, takeProfit: tpOrder } = pickPrimaryRiskOrders(scoped);
  const sl =
    pos.stopLossPrice ?? slOrder?.triggerPrice ?? slOrder?.price;
  const tp =
    pos.takeProfitPrice ?? tpOrder?.triggerPrice ?? tpOrder?.price;
  return { stopLoss: sl, takeProfit: tp };
}

export function riskStatusFromProtection(
  hasSl: boolean,
  hasTp: boolean,
  liqDistPct?: number,
): "protected" | "unprotected" | "danger" | "unknown" {
  if (liqDistPct != null && liqDistPct < 7) return "danger";
  if (!hasSl) return "unprotected";
  if (hasSl) return "protected";
  return "unknown";
}

export function positionToTradeRow(
  pos: BingXNormalizedPosition,
  symbol: string,
  riskOrders: BingXNormalizedRiskOrder[],
  equityUsdt?: number,
): TradeReviewRow {
  const { stopLoss, takeProfit } = resolveRiskPrices(pos, riskOrders, symbol);
  const hasSl = stopLoss != null && stopLoss > 0;
  const hasTp = takeProfit != null && takeProfit > 0;
  const mistakes: string[] = [];
  if (!hasSl) mistakes.push("No real SL detected");
  if (!hasTp) mistakes.push("No real TP detected");
  if (hasSl && hasTp) mistakes.length = 0;

  const pnl = pos.unrealizedPnlUsdt;
  const pnlPct =
    pos.roePct ??
    (pnl != null && equityUsdt != null && equityUsdt > 0
      ? (pnl / equityUsdt) * 100
      : null);

  return {
    id: `bingx-open-${symbol}-${pos.side}`,
    time: formatTime(Date.now()),
    direction: pos.side === "short" ? "Short" : "Long",
    setup: "Real BingX",
    entry: pos.entryPrice ?? null,
    exit: pos.markPrice ?? null,
    r: null,
    pnlUsdt: pnl ?? null,
    pnlAccountPct: pnlPct,
    quality: "—",
    mistakes: mistakes.length ? mistakes.join("; ") : "None",
    notes: hasSl
      ? `SL @ ${stopLoss?.toFixed(2)}`
      : "Open · unrealized",
    tags: "open,read-only",
    status: "open",
    source: "bingx",
  };
}

export function normalizeBingxFillsToRows(
  fills: BingxRawFillRow[],
  orders: BingxRawFillRow[],
): TradeReviewRow[] {
  const rows: TradeReviewRow[] = [];
  let idx = 0;

  for (const f of fills) {
    const price = coerceNum(f.price ?? f.avgPrice ?? f.fillPrice);
    const qty = coerceNum(f.qty ?? f.quantity ?? f.volume);
    const realized = coerceNum(f.realizedPnl ?? f.profit ?? f.pnl);
    const statusRaw = String(f.status ?? "").toLowerCase();
    const closed =
      statusRaw.includes("filled") ||
      statusRaw.includes("closed") ||
      realized != null;

    rows.push({
      id: `bingx-fill-${f.orderId ?? f.tradeId ?? idx++}`,
      time: formatTime(f.time ?? f.fillTime ?? f.timestamp ?? f.updateTime),
      direction: sideFromRaw(f),
      setup: "Real BingX",
      entry: price ?? null,
      exit: closed ? price ?? null : null,
      r: null,
      pnlUsdt: realized ?? null,
      quality: "—",
      mistakes: "—",
      notes: qty != null ? `Qty ${qty}` : "",
      tags: "bingx,history",
      status: closed ? "closed" : "open",
      source: "bingx",
    });
  }

  for (const o of orders) {
    if (rows.some((r) => r.id.includes(String(o.orderId ?? "")))) continue;
    const price = coerceNum(o.price ?? o.avgPrice);
    rows.push({
      id: `bingx-order-${o.orderId ?? idx++}`,
      time: formatTime(o.time ?? o.updateTime ?? o.createTime),
      direction: sideFromRaw(o),
      setup: "Real BingX",
      entry: price ?? null,
      exit: null,
      r: null,
      pnlUsdt: null,
      quality: "—",
      mistakes: "—",
      notes: String(o.type ?? o.orderType ?? "order"),
      tags: "bingx,history",
      status: "unknown",
      source: "bingx",
    });
  }

  return rows.sort((a, b) => b.time.localeCompare(a.time));
}
