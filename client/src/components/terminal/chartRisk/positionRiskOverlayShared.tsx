import type { PointerEvent as ReactPointerEvent } from "react";
import { cn } from "@/lib/utils";
import {
  buildRiskLevelNetMetrics,
  formatSignedPct,
  formatSignedUsd,
  resolveAccountEquityUsdt,
  resolveChartFeeBps,
  type ChartFeeSettings,
} from "./riskLevelMetrics";
import type {
  PositionRiskOverlayAccount,
  PositionRiskOverlayMode,
  PositionRiskOverlayPosition,
  PositionRiskOverlaySide,
} from "./positionRiskOverlayTypes";
import {
  BAR_HEIGHT,
  PRICE_SCALE_INSET,
  SL_LINE,
  SL_PREVIEW_INVALID,
  TP_LINE,
  TP_PREVIEW_INVALID,
} from "./positionRiskOverlayStyles";

export type RiskKind = "SL" | "TP";

export function riskKindPrefix(mode: PositionRiskOverlayMode, kind: RiskKind): string {
  if (mode === "bingx_read_only") return `${kind} REAL`;
  return kind;
}

export function formatRiskLevelPrice(price: number): string {
  return price.toLocaleString("en-US", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

export function useRiskLevelMetrics(params: {
  side: PositionRiskOverlaySide;
  entryPrice: number;
  quantity: number;
  levelPrice: number | null;
  account?: { equityUsdt?: number; balanceUsdt?: number } | null;
  feeSettings?: Partial<ChartFeeSettings> | null;
}): { netPnlUsdt: number | null; accountPct: number | null } {
  const { side, entryPrice, quantity, levelPrice, account, feeSettings } = params;
  if (levelPrice == null || quantity <= 0 || entryPrice <= 0) {
    return { netPnlUsdt: null, accountPct: null };
  }
  const equity = resolveAccountEquityUsdt(account);
  const fees = resolveChartFeeBps(feeSettings);
  return buildRiskLevelNetMetrics(
    side,
    entryPrice,
    quantity,
    levelPrice,
    equity,
    fees,
  );
}

export function RiskLevelLabel({
  mode,
  kind,
  price,
  preview,
  lineColor,
  netPnlUsdt,
  accountPct,
  showReadOnlyBadge,
}: {
  mode: PositionRiskOverlayMode;
  kind: RiskKind;
  price: number;
  preview?: boolean;
  lineColor: string;
  netPnlUsdt: number | null;
  accountPct: number | null;
  showReadOnlyBadge?: boolean;
}) {
  const pnlColor =
    netPnlUsdt == null
      ? "text-slate-400"
      : netPnlUsdt > 0
        ? "text-emerald-400"
        : netPnlUsdt < 0
          ? "text-red-400"
          : "text-slate-400";

  const prefix = riskKindPrefix(mode, kind);

  return (
    <div
      className="absolute -translate-y-1/2 pointer-events-none flex items-center gap-1 rounded px-1 py-px text-[9px] font-mono font-bold border backdrop-blur-sm max-w-[min(100%,280px)]"
      style={{
        right: 4,
        borderColor: lineColor,
        backgroundColor: "rgba(0,0,0,0.82)",
      }}
    >
      <span style={{ color: lineColor }} className="shrink-0 whitespace-nowrap tabular-nums">
        {prefix}
        {preview ? " preview" : ""} {formatRiskLevelPrice(price)}
      </span>
      {netPnlUsdt != null ? (
        <span className={cn("shrink-0 whitespace-nowrap tabular-nums", pnlColor)}>
          {formatSignedUsd(netPnlUsdt)}
        </span>
      ) : null}
      {accountPct != null ? (
        <span className={cn("shrink-0 whitespace-nowrap tabular-nums", pnlColor)}>
          {formatSignedPct(accountPct)}
        </span>
      ) : null}
      {showReadOnlyBadge ? (
        <span className="shrink-0 whitespace-nowrap text-[8px] text-slate-500 uppercase">
          READ ONLY
        </span>
      ) : null}
    </div>
  );
}

export function RiskLevelLine({
  kind,
  price,
  y,
  chartWidth,
  lineColor,
  readonly,
  dragging,
  netPnlUsdt,
  accountPct,
  mode,
  showReadOnlyBadge,
  onPointerDown,
}: {
  kind: RiskKind;
  price: number;
  y: number;
  chartWidth: number;
  lineColor: string;
  readonly: boolean;
  dragging?: boolean;
  netPnlUsdt: number | null;
  accountPct: number | null;
  mode: PositionRiskOverlayMode;
  showReadOnlyBadge?: boolean;
  onPointerDown?: (e: ReactPointerEvent<HTMLDivElement>) => void;
}) {
  if (!Number.isFinite(y) || y < 0 || y > 50000) return null;

  return (
    <div
      className="absolute left-0 pointer-events-none"
      style={{
        top: y,
        width: chartWidth - PRICE_SCALE_INSET,
        height: 0,
        zIndex: readonly ? 11 : 14,
      }}
    >
      <div
        className={cn(
          "absolute left-0 right-0 h-px -translate-y-1/2",
          readonly && "border-dashed",
        )}
        style={{
          backgroundColor: lineColor,
          opacity: readonly ? 0.75 : dragging ? 1 : 0.9,
          boxShadow: dragging ? `0 0 6px ${lineColor}` : undefined,
        }}
      />
      {!readonly && onPointerDown ? (
        <div
          role="slider"
          aria-label={kind === "SL" ? "Drag SL line to modify" : "Drag TP line to modify"}
          title={kind === "SL" ? "Drag SL line to modify" : "Drag TP line to modify"}
          className={cn(
            "absolute left-0 right-0 h-4 -translate-y-1/2 cursor-ns-resize pointer-events-auto",
            dragging && "bg-white/[0.03]",
          )}
          onPointerDown={onPointerDown}
        />
      ) : null}
      <RiskLevelLabel
        mode={mode}
        kind={kind}
        price={price}
        lineColor={lineColor}
        netPnlUsdt={netPnlUsdt}
        accountPct={accountPct}
        showReadOnlyBadge={showReadOnlyBadge}
      />
    </div>
  );
}

export function formatOverlayPnlUsdt(usdt: number | undefined): string {
  if (usdt == null || !Number.isFinite(usdt)) return "—";
  const sign = usdt > 0 ? "+" : "";
  return `${sign}${usdt.toFixed(2)}$`;
}

export function formatOverlayQty(qty: number): string {
  if (!Number.isFinite(qty) || qty <= 0) return "—";
  if (qty >= 1) return qty.toFixed(4);
  if (qty >= 0.01) return qty.toFixed(5);
  return qty.toFixed(6);
}

export function formatEntryPrice(price: number): string {
  return price.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatMarginMode(mode?: string): string {
  if (!mode || mode === "unknown") return "";
  return mode.toUpperCase();
}

export function PlacementPreviewLine({
  mode,
  kind,
  price,
  y,
  chartWidth,
  invalid,
  netPnlUsdt,
  accountPct,
}: {
  mode: PositionRiskOverlayMode;
  kind: RiskKind;
  price: number;
  y: number;
  chartWidth: number;
  invalid: boolean;
  netPnlUsdt: number | null;
  accountPct: number | null;
}) {
  if (!Number.isFinite(y) || y < 0 || y > 50000) return null;

  const baseColor = kind === "SL" ? SL_LINE : TP_LINE;
  const color = invalid
    ? kind === "SL"
      ? SL_PREVIEW_INVALID
      : TP_PREVIEW_INVALID
    : baseColor;

  return (
    <div
      className="absolute left-0 z-[15] pointer-events-none"
      style={{
        top: y,
        width: chartWidth - PRICE_SCALE_INSET,
        height: 0,
      }}
    >
      <div
        className="absolute left-0 right-0 h-px -translate-y-1/2 border-dashed"
        style={{
          backgroundColor: color,
          opacity: 0.85,
          boxShadow: `0 0 4px ${color}`,
        }}
      />
      <RiskLevelLabel
        mode={mode}
        kind={kind}
        price={price}
        preview
        lineColor={color}
        netPnlUsdt={netPnlUsdt}
        accountPct={accountPct}
      />
    </div>
  );
}

/** BingX chart position bar: LIVE vs locked status label. */
export function resolveBingxExecutionBadge(
  mode: PositionRiskOverlayMode,
  liveTradingEnabled?: boolean,
): "LIVE" | "LOCKED" | null {
  if (mode !== "bingx_read_only") return null;
  return liveTradingEnabled ? "LIVE" : "LOCKED";
}

export function formatBingxBarStatusLabel(
  liveTradingEnabled?: boolean,
  compact?: boolean,
): string {
  if (liveTradingEnabled) return "LIVE";
  return compact ? "RO" : "READ ONLY";
}

export function formatBingxCompactEntryPrice(price: number): string {
  return price.toLocaleString("en-US", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

export function formatBingxMarginModeShort(mode?: string): string {
  if (!mode || mode === "unknown") return "";
  const m = mode.toLowerCase();
  if (m === "isolated") return "ISO";
  if (m === "cross") return "CROSS";
  return m.toUpperCase();
}

export function formatBingxPositionAccountPct(
  position: PositionRiskOverlayPosition,
  account?: PositionRiskOverlayAccount | null,
): string | null {
  const fromSnapshot = position.unrealizedPnlAccountPct;
  if (fromSnapshot != null && Number.isFinite(fromSnapshot)) {
    return formatSignedPct(fromSnapshot);
  }
  const pnl = position.unrealizedPnlUsdt;
  const equity = account?.equityUsdt ?? account?.balanceUsdt;
  if (
    pnl == null ||
    equity == null ||
    !Number.isFinite(equity) ||
    equity <= 0
  ) {
    return null;
  }
  return formatSignedPct((pnl / equity) * 100);
}

