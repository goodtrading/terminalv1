/**
 * Bookmap-Style Order Book Tracker
 * Faithful to real Binance order book levels with persistence tracking
 */

import { 
  OrderBookLevel, 
  OrderBookSnapshot, 
  BookmapConfig, 
  TrackerOutput,
  DEFAULT_BOOKMAP_CONFIG 
} from './bookmapOrderBookTypes';

export class BookmapOrderBookTracker {
  private config: BookmapConfig;
  private levelHistory: Map<string, OrderBookLevel> = new Map();
  private lastSnapshot: OrderBookSnapshot | null = null;
  private sequenceCounter = 0;
  private DEBUG_ENABLED = process.env.NODE_ENV === 'development';

  constructor(config: Partial<BookmapConfig> = {}) {
    this.config = { ...DEFAULT_BOOKMAP_CONFIG, ...config };
  }

  /**
   * Update order book with new snapshot from Binance
   */
  updateSnapshot(rawBids: [string, string][], rawAsks: [string, string][], timestamp: number): void {
    const now = timestamp || Date.now();
    this.sequenceCounter++;

    // Parse raw Binance data
    const bids = this.parseRawLevels(rawBids, 'BID', now);
    const asks = this.parseRawLevels(rawAsks, 'ASK', now);

    // Update level history and persistence
    this.updateLevelHistory(bids, asks, now);

    // Create current snapshot
    this.lastSnapshot = {
      bids: bids.slice(0, this.config.filtering.maxLevels),
      asks: asks.slice(0, this.config.filtering.maxLevels),
      timestamp: now,
      sequenceId: this.sequenceCounter
    };

    // Cleanup old levels periodically
    if (this.sequenceCounter % 100 === 0) {
      this.cleanupOldLevels(now);
    }
  }

  /**
   * Parse raw Binance order book levels
   */
  private parseRawLevels(rawLevels: [string, string][], side: 'BID' | 'ASK', timestamp: number): OrderBookLevel[] {
    return rawLevels
      .filter(([_, size]) => parseFloat(size) >= this.config.filtering.minSize)
      .map(([price, size]) => {
        const priceNum = parseFloat(price);
        const sizeNum = parseFloat(size);
        const key = `${side}_${priceNum}`;
        
        const existing = this.levelHistory.get(key);
        
        if (existing) {
          // Update existing level
          existing.lastSeen = timestamp;
          existing.currentSize = sizeNum;
          existing.maxSize = Math.max(existing.maxSize, sizeNum);
          existing.sizeHistory.push({ timestamp, size: sizeNum });
          
          // Keep only recent history (last 100 updates)
          if (existing.sizeHistory.length > 100) {
            existing.sizeHistory = existing.sizeHistory.slice(-100);
          }
          
          // Update persistence score
          existing.persistence = this.calculatePersistence(existing, timestamp);
          
          return { ...existing };
        } else {
          // New level
          const newLevel: OrderBookLevel = {
            price: priceNum,
            size: sizeNum,
            side,
            timestamp,
            firstSeen: timestamp,
            lastSeen: timestamp,
            currentSize: sizeNum,
            maxSize: sizeNum,
            persistence: 0, // New levels start with 0 persistence
            sizeHistory: [{ timestamp, size: sizeNum }]
          };
          
          this.levelHistory.set(key, newLevel);
          return newLevel;
        }
      });
  }

  /**
   * Update level history for persistence tracking
   */
  private updateLevelHistory(bids: OrderBookLevel[], asks: OrderBookLevel[], timestamp: number): void {
    const currentKeys = new Set<string>();
    
    // Mark all current levels as present
    [...bids, ...asks].forEach(level => {
      const key = `${level.side}_${level.price}`;
      currentKeys.add(key);
      
      // Update persistence for existing levels
      const existing = this.levelHistory.get(key);
      if (existing) {
        existing.persistence = this.calculatePersistence(existing, timestamp);
      }
    });
    
    // Mark levels that disappeared as inactive (but keep in history for persistence)
    this.levelHistory.forEach((level, key) => {
      if (!currentKeys.has(key) && level.lastSeen < timestamp) {
        // Level disappeared from order book
        level.lastSeen = timestamp;
        level.currentSize = 0; // Mark as inactive but keep history
      }
    });
  }

  /**
   * Calculate persistence score for a level
   */
  private calculatePersistence(level: OrderBookLevel, currentTime: number): number {
    const age = currentTime - level.firstSeen;
    const maxAge = this.config.persistence.threshold;
    
    if (age < maxAge) {
      return age / maxAge; // Linear growth from 0 to 1 over threshold time
    }
    
    // Check if level was recently active
    const timeSinceLastSeen = currentTime - level.lastSeen;
    if (timeSinceLastSeen > maxAge) {
      // Level hasn't been seen for a while, decay persistence
      const decayFactor = Math.max(0, 1 - (timeSinceLastSeen - maxAge) / maxAge);
      return Math.min(1, age / maxAge) * decayFactor;
    }
    
    return Math.min(1, age / maxAge);
  }

  /**
   * Cleanup very old levels to prevent memory leaks
   */
  private cleanupOldLevels(currentTime: number): void {
    const maxAge = this.config.persistence.threshold * 5; // Keep 5x threshold time
    const keysToDelete: string[] = [];
    
    this.levelHistory.forEach((level, key) => {
      if (currentTime - level.lastSeen > maxAge && level.currentSize === 0) {
        keysToDelete.push(key);
      }
    });
    
    keysToDelete.forEach(key => this.levelHistory.delete(key));
  }

  /**
   * Get current tracker output for rendering
   */
  getTrackerOutput(): TrackerOutput {
    if (!this.lastSnapshot) {
      return this.createEmptyOutput();
    }

    const rawLevels = {
      bids: this.lastSnapshot.bids,
      asks: this.lastSnapshot.asks
    };

    // Filter persistent levels
    const persistentLevels = {
      bids: rawLevels.bids.filter(level => 
        level.persistence >= this.config.persistence.minScore &&
        level.size >= this.config.filtering.minSize
      ),
      asks: rawLevels.asks.filter(level => 
        level.persistence >= this.config.persistence.minScore &&
        level.size >= this.config.filtering.minSize
      )
    };

    // Optional aggregation
    let aggregatedLevels;
    if (this.config.aggregation.enabled) {
      aggregatedLevels = {
        bids: this.aggregateLevels(rawLevels.bids),
        asks: this.aggregateLevels(rawLevels.asks)
      };
    }

    // Calculate stats
    const stats = {
      totalBidSize: rawLevels.bids.reduce((sum, level) => sum + level.size, 0),
      totalAskSize: rawLevels.asks.reduce((sum, level) => sum + level.size, 0),
      bidLevels: rawLevels.bids.length,
      askLevels: rawLevels.asks.length,
      persistentBidLevels: persistentLevels.bids.length,
      persistentAskLevels: persistentLevels.asks.length
    };

    return {
      rawLevels,
      persistentLevels,
      aggregatedLevels,
      stats
    };
  }

  /**
   * Minimal aggregation by price step (if enabled)
   */
  private aggregateLevels(levels: OrderBookLevel[]): OrderBookLevel[] {
    if (!this.config.aggregation.enabled) {
      return levels;
    }

    const step = this.config.aggregation.priceStep;
    const buckets = new Map<number, OrderBookLevel>();

    levels.forEach(level => {
      const bucketKey = Math.floor(level.price / step) * step;
      const existing = buckets.get(bucketKey);

      if (existing) {
        // Aggregate into existing bucket
        existing.size += level.size;
        existing.maxSize = Math.max(existing.maxSize, level.size);
        existing.persistence = Math.max(existing.persistence, level.persistence);
        existing.sizeHistory.push({
          timestamp: level.timestamp,
          size: existing.size
        });
      } else {
        // Create new bucket
        buckets.set(bucketKey, {
          ...level,
          price: bucketKey, // Use bucket price
          size: level.size
        });
      }
    });

    return Array.from(buckets.values());
  }

  /**
   * Create empty output for initialization
   */
  private createEmptyOutput(): TrackerOutput {
    return {
      rawLevels: { bids: [], asks: [] },
      persistentLevels: { bids: [], asks: [] },
      stats: {
        totalBidSize: 0,
        totalAskSize: 0,
        bidLevels: 0,
        askLevels: 0,
        persistentBidLevels: 0,
        persistentAskLevels: 0
      }
    };
  }

  /**
   * Get configuration
   */
  getConfig(): BookmapConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<BookmapConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Get level history for debugging
   */
  getLevelHistory(): Map<string, OrderBookLevel> {
    return new Map(this.levelHistory);
  }

  /**
   * Get last snapshot
   */
  getLastSnapshot(): OrderBookSnapshot | null {
    return this.lastSnapshot;
  }
}
