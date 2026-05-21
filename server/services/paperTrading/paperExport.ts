import { getPaperFills, getPaperTradeLedger } from "./paperStore";
import type { PaperFill, PaperTradeLedgerEntry } from "./paperTypes";

function escapeCsv(value: unknown): string {
  if (value == null) return "";
  const s = Array.isArray(value) ? value.join("; ") : String(value);
  if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function row(values: unknown[]): string {
  return values.map(escapeCsv).join(",");
}

export function buildPaperTradesCsv(): string {
  const headers = [
    "tradeId",
    "symbol",
    "side",
    "status",
    "entryTime",
    "exitTime",
    "entryPrice",
    "exitPrice",
    "quantity",
    "notionalUsdt",
    "leverage",
    "marginMode",
    "stopLoss",
    "takeProfit",
    "realizedPnlUsdt",
    "unrealizedPnlUsdt",
    "feesUsdt",
    "rMultiple",
    "setup",
    "tags",
    "mistakes",
    "notes",
  ];

  const trades = getPaperTradeLedger();
  const lines = [
    headers.join(","),
    ...trades.map((t: PaperTradeLedgerEntry) =>
      row([
        t.id,
        t.symbol,
        t.side,
        t.status,
        t.entryTime,
        t.exitTime ?? "",
        t.entryPrice,
        t.exitPrice ?? "",
        t.quantity,
        t.notionalUsdt,
        t.leverage,
        t.marginMode,
        t.stopLoss ?? "",
        t.takeProfit ?? "",
        t.realizedPnlUsdt,
        t.unrealizedPnlUsdt,
        t.feesUsdt,
        t.rMultiple ?? "",
        t.setup ?? "",
        t.tags ?? [],
        t.mistakes ?? [],
        t.notes ?? "",
      ]),
    ),
  ];
  return lines.join("\n");
}

export function buildPaperFillsCsv(): string {
  const headers = [
    "fillId",
    "tradeId",
    "orderId",
    "symbol",
    "side",
    "action",
    "price",
    "quantity",
    "notionalUsdt",
    "feeUsdt",
    "slippageUsdt",
    "timestamp",
  ];

  const fills = getPaperFills();
  const lines = [
    headers.join(","),
    ...fills.map((f: PaperFill) =>
      row([
        f.id,
        f.tradeId,
        f.orderId,
        f.symbol,
        f.side,
        f.action,
        f.price,
        f.quantity,
        f.notionalUsdt,
        f.feeUsdt,
        f.slippageUsdt,
        f.timestamp,
      ]),
    ),
  ];
  return lines.join("\n");
}
