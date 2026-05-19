export type BookSide = "bid" | "ask";

export interface BookLevel {
  price: number;
  size: number;
  side: BookSide;
  firstSeenTs: number;
  lastUpdateTs: number;
  maxSeenSize: number;
  isImportant: boolean;
  isStructural: boolean;
  isMajor: boolean;
  stale: boolean;
}

export interface HeatmapCell {
  timeBucket: number;
  price: number;
  side: BookSide;
  size: number;
  maxSizeInBucket: number;
  lastSizeInBucket: number;
  lastUpdateTs: number;
}

export interface BookmapState {
  symbol: string;
  exchange: string;
  bids: BookLevel[];
  asks: BookLevel[];
  heatmapCells: HeatmapCell[];
  importantWalls: BookLevel[];
  structuralWalls: BookLevel[];
  majorWalls: BookLevel[];
  timestamp: number;
}
