/**
 * Bookmap-Style Order Book Data Structures
 * Faithful to real Binance order book levels
 */

export interface OrderBookLevel {
  price: number;           // Exact price from Binance
  size: number;            // Exact BTC size from Binance
  side: 'BID' | 'ASK';     // Order side
  timestamp: number;        // Last update timestamp
  firstSeen: number;        // When this level was first detected
  lastSeen: number;         // When this level was last seen
  currentSize: number;      // Current size (0 if level disappeared)
  maxSize: number;          // Maximum size observed at this level
  persistence: number;      // Persistence score (0-1)
  sizeHistory: Array<{      // Size change history
    timestamp: number;
    size: number;
  }>;
}

export interface OrderBookSnapshot {
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  timestamp?: number;
  sequenceId?: number;      // Binance update sequence
}

export interface BookmapConfig {
  depth: number;            // Number of levels to fetch (1000, 5000)
  aggregation: {
    enabled: boolean;
    priceStep: number;       // Price step for grouping (e.g., 0.1, 0.5, 1.0)
  };
  persistence: {
    threshold: number;       // Milliseconds to consider "persistent" (30000 = 30s)
    minScore: number;        // Minimum persistence score (0.0-1.0)
  };
  filtering: {
    minSize: number;         // Minimum BTC size to track (0.01)
    maxLevels: number;       // Maximum levels per side to store
  };
}

export interface TrackerOutput {
  rawLevels: {
    bids: OrderBookLevel[];
    asks: OrderBookLevel[];
  };
  persistentLevels: {
    bids: OrderBookLevel[];
    asks: OrderBookLevel[];
  };
  aggregatedLevels?: {      // Only if aggregation enabled
    bids: OrderBookLevel[];
    asks: OrderBookLevel[];
  };
  stats: {
    totalBidSize: number;
    totalAskSize: number;
    bidLevels: number;
    askLevels: number;
    persistentBidLevels: number;
    persistentAskLevels: number;
  };
}

export const DEFAULT_BOOKMAP_CONFIG: BookmapConfig = {
  depth: 1000,              // Fetch 1000 levels per side
  aggregation: {
    enabled: false,          // Start with no aggregation
    priceStep: 0.1           // 0.1 BTC steps if enabled
  },
  persistence: {
    threshold: 30000,        // 30 seconds
    minScore: 0.5           // 50% persistence threshold
  },
  filtering: {
    minSize: 0.01,           // Track levels as small as 0.01 BTC
    maxLevels: 500           // Store max 500 levels per side
  }
};
