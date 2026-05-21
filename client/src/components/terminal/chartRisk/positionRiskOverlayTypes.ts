import type { ReactNode, PointerEvent as ReactPointerEvent } from "react";
import type { ChartFeeSettings } from "./riskLevelMetrics";

export type PositionRiskOverlayMode = "paper" | "bingx_read_only";

export type PositionRiskOverlaySide = "long" | "short";

export interface PositionRiskOverlayPosition {
  side: PositionRiskOverlaySide;
  quantity: number;
  entryPrice: number;
  markPrice?: number;
  leverage?: number;
  marginMode?: string;
  unrealizedPnlUsdt?: number;
  /** BingX: ROE / account % when provided by snapshot. */
  unrealizedPnlAccountPct?: number;
}

export interface PositionRiskOverlayAccount {
  equityUsdt?: number;
  balanceUsdt?: number;
}

export interface PositionRiskOverlayLevel {
  price: number;
  label?: string;
  source?: "paper" | "bingx";
}

export interface PositionRiskOverlayProps {
  mode: PositionRiskOverlayMode;
  position: PositionRiskOverlayPosition;
  account?: PositionRiskOverlayAccount | null;
  stopLoss?: PositionRiskOverlayLevel | null;
  takeProfit?: PositionRiskOverlayLevel | null;
  feeSettings?: Partial<ChartFeeSettings> | null;
  readonly: boolean;
  showReadOnlyBadge?: boolean;
  /** BingX position bar: LIVE when enabled, else LOCKED. Defaults to locked. */
  liveTradingEnabled?: boolean;
  /** BingX: allow real close / add SL / add TP from chart (future). Always false in this build. */
  realActionsEnabled?: boolean;
  /** BingX: show +SL/+TP/× locked controls on position bar. */
  showLockedActionControls?: boolean;
  onRequestClosePosition?: () => void;
  onRequestAddStopLoss?: () => void;
  onRequestAddTakeProfit?: () => void;
  /** Optional liquidation line (BingX read-only). */
  liquidationPrice?: number | null;
  chartWidth: number;
  chartHeight: number;
  viewportVersion: number;
  coordinates: import("../drawings/DrawingsLayer").DrawingsCoordinateHelpers;
  candleSeries: {
    createPriceLine: (options: {
      price: number;
      color: string;
      lineWidth: 1 | 2 | 3 | 4;
      lineStyle: number;
      axisLabelVisible: boolean;
      title: string;
    }) => import("lightweight-charts").IPriceLine;
    removePriceLine: (line: import("lightweight-charts").IPriceLine) => void;
  } | null;
  /** Live draft prices while dragging (Paper). */
  draftStopLoss?: number | null;
  draftTakeProfit?: number | null;
  zIndex?: number;
  /** Paper: drag handles for existing SL/TP lines */
  onStopLossPointerDown?: (e: ReactPointerEvent<HTMLDivElement>) => void;
  onTakeProfitPointerDown?: (e: ReactPointerEvent<HTMLDivElement>) => void;
  /** Paper: TP/SL buttons inside position bar */
  paperControls?: ReactNode;
  /** Paper: close button after PnL in bar */
  paperTrailing?: ReactNode;
  /** Paper: placement mode enables chart hit layer */
  placementActive?: boolean;
  /** Paper: hide SL/TP lines while placing that level */
  hideStopLossLine?: boolean;
  hideTakeProfitLine?: boolean;
  draggingStopLoss?: boolean;
  draggingTakeProfit?: boolean;
  children?: ReactNode;
}
