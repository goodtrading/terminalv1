export interface PaperChartTradeOverlay {
  symbol: string;
  side: "long" | "short";
  quantity: number;
  entryPrice: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  markPrice: number | null;
  unrealizedPnlUsdt: number;
  status: "open" | "flat";
  tradeId: string | null;
}

export type PaperRiskDragTarget = "stopLoss" | "takeProfit";

export interface PaperRiskDragState {
  target: PaperRiskDragTarget;
  draftPrice: number;
  committedPrice: number;
}
