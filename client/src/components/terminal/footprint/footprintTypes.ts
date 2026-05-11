/**
 * Footprint — tipos compartidos (Fase 1+).
 */

export type FootprintMode = "hidden" | "summary" | "compact" | "full";

export interface FootprintBar {
  /** Timestamp de apertura de la vela (ms) */
  time: number;
  open?: number;
  high?: number;
  low?: number;
  close?: number;
  levels: FootprintLevel[];
  pocPrice: number | null;
  totalVolume: number;
  /** Volumen agresor comprador (≈ ask side) */
  buyVolume: number;
  /** Volumen agresor vendedor (≈ bid side) */
  sellVolume: number;
  /** Delta neto (buyVolume - sellVolume o convención equivalente) */
  delta: number;
  deltaPct: number;
  stackedBuyImbalance: boolean;
  stackedSellImbalance: boolean;
  unfinishedAuctionHigh: boolean;
  unfinishedAuctionLow: boolean;
  absorption: "buy" | "sell" | null;
  exhaustion: "buy" | "sell" | null;
}

export interface FootprintLevel {
  price: number;
  bidVolume: number;
  askVolume: number;
  totalVolume: number;
  /** ask - bid en volumen del nivel */
  delta: number;
  /** @deprecated usar imbalanceSide; se mantiene por compat */
  imbalance?: "bid" | "ask" | null;
  imbalanceSide?: "buy" | "sell" | null;
  absorptionSide?: "buy" | "sell" | null;
  isPoc?: boolean;
}

export interface AggTrade {
  id: string;
  price: number;
  qty: number;
  time: number;
  side: "buy" | "sell";
}

export interface FootprintRenderState {
  active: boolean;
  /** Chart listo y hay series; no implica que el modo sea distinto de hidden */
  canRender: boolean;
  candleWidth: number;
  rowHeight: number;
  visibleBars: number;
  mode: FootprintMode;
  finalTickSize: number;
}

export interface FootprintConfig {
  minCandleWidth: number;
  minRowHeight: number;
  maxVisibleBars: number;
  maxLevelsPerBar: number;
  imbalanceRatio: number;
  /** Deprecado: el tick efectivo viene de getFootprintTickSize (Fase 1). */
  tickSize: number;
}

export const DEFAULT_FOOTPRINT_CONFIG: FootprintConfig = {
  minCandleWidth: 8,
  minRowHeight: 6,
  maxVisibleBars: 120,
  maxLevelsPerBar: 48,
  imbalanceRatio: 3,
  tickSize: 25,
};
