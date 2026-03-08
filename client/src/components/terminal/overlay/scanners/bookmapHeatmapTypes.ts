/**
 * Bookmap-style heatmap data structures
 * Historical order book visualization with canvas rendering
 */

export interface LiquiditySnapshot {
  timestamp: number;
  bids: Map<number, number>; // price -> size
  asks: Map<number, number>; // price -> size
}

export interface HistoricalLiquidity {
  price: number;
  history: Array<{
    timestamp: number;
    size: number;
    side: 'BID' | 'ASK';
    age: number; // milliseconds since snapshot
  }>;
  maxSize: number;
  currentSize: number;
  lastUpdate: number;
}

export interface HeatmapConfig {
  // Price range and bucketing
  priceRange: {
    min: number;
    max: number;
    auto: boolean; // Auto-adjust to current price
    rangePercent: number; // % of current price for auto range
  };
  bucketing: {
    priceStep: number; // Price granularity (0.1, 0.5, 1.0, etc.)
    maxLevels: number; // Max price levels to track
  };
  
  // History and time
  history: {
    windowMs: number; // Time window to keep (60000 = 1 minute)
    maxSnapshots: number; // Max snapshots in memory
    fadeStartMs: number; // When to start fading (30000 = 30s)
    fadeEndMs: number; // When to fully fade (60000 = 60s)
  };
  
  // Visual settings
  rendering: {
    intensity: {
      minOpacity: number; // 0.0 - 1.0
      maxOpacity: number; // 0.0 - 1.0
      scaling: 'linear' | 'logarithmic'; // Size to intensity mapping
    };
    colors: {
      bid: string; // Base color for bids (e.g., '#22c55e')
      ask: string; // Base color for asks (e.g., '#ef4444')
      neutral: string; // Color for balanced areas
    };
    dimensions: {
      width: number;
      height: number;
      padding: number;
    };
  };
}

export interface HeatmapCell {
  x: number; // Canvas x coordinate
  y: number; // Canvas y coordinate (price)
  width: number;
  height: number; // Price bucket height
  intensity: number; // 0.0 - 1.0
  color: string;
  side: 'BID' | 'ASK' | 'NEUTRAL';
  age: number; // Age of liquidity in milliseconds
}

export interface HeatmapFrame {
  timestamp: number;
  cells: HeatmapCell[];
  priceLevels: number[]; // Sorted price levels for mapping
  minPrice: number;
  maxPrice: number;
  totalBidLiquidity: number;
  totalAskLiquidity: number;
}

export const DEFAULT_HEATMAP_CONFIG: HeatmapConfig = {
  priceRange: {
    min: 60000,
    max: 75000,
    auto: true,
    rangePercent: 0.15 // 15% of current price
  },
  bucketing: {
    priceStep: 1.0, // 1 USD granularity
    maxLevels: 1500 // Support up to 1500 price levels
  },
  history: {
    windowMs: 60000, // 1 minute history
    maxSnapshots: 60, // 1 snapshot per second
    fadeStartMs: 30000, // Start fading after 30s
    fadeEndMs: 60000 // Fully fade after 60s
  },
  rendering: {
    intensity: {
      minOpacity: 0.1,
      maxOpacity: 0.9,
      scaling: 'logarithmic'
    },
    colors: {
      bid: '#22c55e',
      ask: '#ef4444', 
      neutral: '#6b7280'
    },
    dimensions: {
      width: 800,
      height: 400,
      padding: 10
    }
  }
};
