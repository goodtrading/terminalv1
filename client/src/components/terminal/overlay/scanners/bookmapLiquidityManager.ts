/**
 * Liquidity history management for Bookmap heatmap
 * Stores and manages historical order book data over time
 */

import { LiquiditySnapshot, HistoricalLiquidity, HeatmapConfig } from './bookmapHeatmapTypes';

export class BookmapLiquidityManager {
  private config: HeatmapConfig;
  private historicalLiquidity: Map<number, HistoricalLiquidity> = new Map();
  private snapshots: LiquiditySnapshot[] = [];
  private lastCleanup = Date.now();
  
  constructor(config: HeatmapConfig) {
    this.config = config;
  }

  /**
   * Add new order book snapshot
   */
  addSnapshot(bids: [string, string][], asks: [string, string][], timestamp: number): void {
    // Convert to price->size maps
    const bidMap = new Map<number, number>();
    const askMap = new Map<number, number>();
    
    bids.forEach(([priceStr, sizeStr]) => {
      const price = parseFloat(priceStr);
      const size = parseFloat(sizeStr);
      bidMap.set(price, size);
    });
    
    asks.forEach(([priceStr, sizeStr]) => {
      const price = parseFloat(priceStr);
      const size = parseFloat(sizeStr);
      askMap.set(price, size);
    });
    
    const snapshot: LiquiditySnapshot = {
      timestamp,
      bids: bidMap,
      asks: askMap
    };
    
    // Add to snapshots array
    this.snapshots.push(snapshot);
    
    // Update historical liquidity
    this.updateHistoricalLiquidity(snapshot);
    
    // Cleanup old data
    this.cleanup(timestamp);
  }

  /**
   * Update historical liquidity with new snapshot
   */
  private updateHistoricalLiquidity(snapshot: LiquiditySnapshot): void {
    const timestamp = snapshot.timestamp;
    
    // Process bids
    snapshot.bids.forEach((size, price) => {
      this.updateLiquidityLevel(price, size, 'BID', timestamp);
    });
    
    // Process asks
    snapshot.asks.forEach((size, price) => {
      this.updateLiquidityLevel(price, size, 'ASK', timestamp);
    });
    
    // Update existing levels that might have disappeared
    this.historicalLiquidity.forEach((liquidity, price) => {
      const currentBidSize = snapshot.bids.get(price) || 0;
      const currentAskSize = snapshot.asks.get(price) || 0;
      const currentSize = currentBidSize + currentAskSize;
      
      if (currentSize === 0 && liquidity.currentSize > 0) {
        // Level disappeared, record zero size
        this.updateLiquidityLevel(price, 0, liquidity.currentSize > 0 ? 'BID' : 'ASK', timestamp);
      }
    });
  }

  /**
   * Update individual liquidity level
   */
  private updateLiquidityLevel(price: number, size: number, side: 'BID' | 'ASK', timestamp: number): void {
    if (!this.historicalLiquidity.has(price)) {
      this.historicalLiquidity.set(price, {
        price,
        history: [],
        maxSize: 0,
        currentSize: 0,
        lastUpdate: timestamp
      });
    }
    
    const liquidity = this.historicalLiquidity.get(price)!;
    
    // Add to history
    liquidity.history.push({
      timestamp,
      size,
      side,
      age: 0 // Will be calculated when used
    });
    
    // Update current state
    liquidity.currentSize = size;
    liquidity.maxSize = Math.max(liquidity.maxSize, size);
    liquidity.lastUpdate = timestamp;
    
    // Limit history size
    const maxHistorySize = 100;
    if (liquidity.history.length > maxHistorySize) {
      liquidity.history = liquidity.history.slice(-maxHistorySize);
    }
  }

  /**
   * Clean up old data based on configuration
   */
  private cleanup(currentTimestamp: number): void {
    // Cleanup snapshots
    const maxAge = this.config.history.windowMs;
    this.snapshots = this.snapshots.filter(snapshot => 
      currentTimestamp - snapshot.timestamp <= maxAge
    );
    
    // Limit snapshot count
    if (this.snapshots.length > this.config.history.maxSnapshots) {
      this.snapshots = this.snapshots.slice(-this.config.history.maxSnapshots);
    }
    
    // Cleanup historical liquidity
    this.historicalLiquidity.forEach((liquidity, price) => {
      const age = currentTimestamp - liquidity.lastUpdate;
      
      // Remove very old liquidity levels
      if (age > this.config.history.windowMs * 2) {
        this.historicalLiquidity.delete(price);
      }
    });
    
    // Cleanup old history entries
    this.historicalLiquidity.forEach((liquidity) => {
      liquidity.history = liquidity.history.filter(entry => 
        currentTimestamp - entry.timestamp <= this.config.history.windowMs
      );
    });
  }

  /**
   * Get historical liquidity for heatmap rendering
   */
  getHistoricalLiquidity(): HistoricalLiquidity[] {
    return Array.from(this.historicalLiquidity.values())
      .filter(liquidity => liquidity.currentSize > 0 || 
        (Date.now() - liquidity.lastUpdate) <= this.config.history.fadeEndMs)
      .sort((a, b) => a.price - b.price);
  }

  /**
   * Get current liquidity snapshot
   */
  getCurrentSnapshot(): LiquiditySnapshot | null {
    return this.snapshots.length > 0 ? this.snapshots[this.snapshots.length - 1] : null;
  }

  /**
   * Get price range for current data
   */
  getPriceRange(): { min: number; max: number } | null {
    const prices = Array.from(this.historicalLiquidity.keys());
    if (prices.length === 0) return null;
    
    return {
      min: Math.min(...prices),
      max: Math.max(...prices)
    };
  }

  /**
   * Get liquidity statistics
   */
  getStats(): {
    totalBidLiquidity: number;
    totalAskLiquidity: number;
    activeLevels: number;
    maxLiquidity: number;
  } {
    let totalBidLiquidity = 0;
    let totalAskLiquidity = 0;
    let maxLiquidity = 0;
    
    this.historicalLiquidity.forEach((liquidity) => {
      maxLiquidity = Math.max(maxLiquidity, liquidity.maxSize);
      
      // Calculate current bid/ask split from recent history
      const recentHistory = liquidity.history.slice(-10);
      recentHistory.forEach(entry => {
        if (entry.side === 'BID') {
          totalBidLiquidity += entry.size;
        } else {
          totalAskLiquidity += entry.size;
        }
      });
    });
    
    return {
      totalBidLiquidity,
      totalAskLiquidity,
      activeLevels: this.historicalLiquidity.size,
      maxLiquidity
    };
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<HeatmapConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Clear all historical data
   */
  clear(): void {
    this.historicalLiquidity.clear();
    this.snapshots = [];
  }

  /**
   * Get memory usage statistics
   */
  getMemoryStats(): {
    liquidityLevels: number;
    totalHistoryEntries: number;
    snapshots: number;
  } {
    let totalHistoryEntries = 0;
    this.historicalLiquidity.forEach((liquidity) => {
      totalHistoryEntries += liquidity.history.length;
    });
    
    return {
      liquidityLevels: this.historicalLiquidity.size,
      totalHistoryEntries,
      snapshots: this.snapshots.length
    };
  }
}
