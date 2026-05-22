import type { PaperPositionSnapshot } from "../execution/executionTypes";
import type { PaperChartTradeOverlay } from "./paperTradeOverlayTypes";
import {
  normalizePaperQuantity,
  type PaperQuantitySource,
} from "./normalizePaperQuantity";

/** Map API position (may use size instead of quantity) to client snapshot. */
export function mapApiPaperPosition(
  raw: PaperPositionSnapshot | null | undefined,
): PaperPositionSnapshot | null {
  if (!raw || raw.side === "flat") return null;

  const { qtyBTC, notionalUSDT } = normalizePaperQuantity(
    raw as PaperQuantitySource,
    raw.entryPrice,
  );

  if (qtyBTC == null || qtyBTC <= 0) {
    return {
      ...raw,
      quantity: 0,
    };
  }

  const rawAny = raw as PaperPositionSnapshot & Record<string, unknown>;
  const unrealized =
    rawAny.unrealizedPnl ??
    rawAny.unrealizedPnL ??
    (rawAny as { uPnl?: number }).uPnl ??
    (rawAny as { pnl?: number }).pnl;

  return {
    ...raw,
    quantity: qtyBTC,
    ...(notionalUSDT != null ? { notionalUSDT } : {}),
    ...(Number.isFinite(Number(unrealized)) ? { unrealizedPnl: Number(unrealized) } : {}),
  } as PaperPositionSnapshot;
}

export function mapPaperChartOverlay(
  position: PaperPositionSnapshot | null | undefined,
  unrealizedPnlUsdt: number | undefined,
): PaperChartTradeOverlay | null {
  if (!position || position.side === "flat") {
    return null;
  }
  if (position.entryPrice == null || !Number.isFinite(position.entryPrice)) {
    return null;
  }

  const { qtyBTC, notionalUSDT } = normalizePaperQuantity(
    {
      qtyBTC: (position as { qtyBTC?: number }).qtyBTC,
      qty: (position as { qty?: number }).qty,
      quantity: position.quantity,
      size: (position as { size?: number }).size,
      notionalUSDT: (position as { notionalUSDT?: number }).notionalUSDT,
      entryPrice: position.entryPrice,
      markPrice: position.markPrice,
    },
    position.entryPrice,
  );

  if (qtyBTC == null || qtyBTC <= 0) {
    return null;
  }

  return {
    symbol: position.symbol,
    side: position.side,
    quantity: qtyBTC,
    qtyBTC,
    qty: qtyBTC,
    notionalUSDT,
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

export {
  DEFAULT_CHART_FEE_DEFAULTS as DEFAULT_PAPER_CHART_FEE_DEFAULTS,
  DEFAULT_ACCOUNT_BASE_USDT as DEFAULT_PAPER_ACCOUNT_BASE_USDT,
  type ChartFeeSettings as PaperChartFeeSettings,
  type RiskLevelNetResult as PaperRiskLevelNetResult,
  resolveChartFeeBps as resolvePaperChartFeeBps,
  resolveAccountEquityUsdt as resolvePaperAccountBaseUsdt,
  calculateRiskLevelNetPnl as calculatePaperRiskLevelNetPnl,
  formatSignedUsd,
  formatSignedPct,
  buildRiskLevelNetMetrics,
  createEmptyRiskLevelMetrics,
  EMPTY_RISK_LEVEL_NET_METRICS,
} from "../chartRisk/riskLevelMetrics";

export function formatQtyBtc(value: unknown): string {
  const qty = Number(value);
  if (!Number.isFinite(qty) || qty <= 0) return "—";
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

export {
  normalizePaperQuantity,
  type NormalizedPaperQuantity,
  type PaperQuantitySource,
} from "./normalizePaperQuantity";
