/**
 * Institutional Order Book Scanner
 * Scans full depth for major liquidity walls and magnet orders
 */

export interface LiquidityWall {
  price: number;
  size: number;        // Total BTC size at this level
  side: 'BID' | 'ASK';
  type: 'WALL' | 'MAGNET' | 'NORMAL';
  strength: number;   // Normalized strength 0-1
  distance: number;  // Distance from current price (%)
}

export interface LiquidityAnalysis {
  bidWalls: LiquidityWall[];
  askWalls: LiquidityWall[];
  topBidWall: LiquidityWall | null;
  topAskWall: LiquidityWall | null;
  currentPrice: number;
  totalBidSize: number;
  totalAskSize: number;
  timestamp: number;
}

export interface ScannerConfig {
  minWallSize: number;        // Minimum BTC to consider as wall (default: 10 BTC)
  magnetThreshold: number;    // Size ratio for magnet detection (default: 3x avg)
  maxDepth: number;           // Maximum price % to scan (default: 5%)
  wallDensityThreshold: number; // Concentration factor (default: 0.7)
}

const DEFAULT_CONFIG: ScannerConfig = {
  minWallSize: 10,           // 10 BTC minimum
  magnetThreshold: 3,         // 3x average size
  maxDepth: 0.05,            // 5% price range
  wallDensityThreshold: 0.7   // 70% concentration
};

/**
 * Scans order book for major liquidity walls and magnet orders
 */
export class InstitutionalOrderBookScanner {
  private config: ScannerConfig;
  private priceHistory: number[] = [];
  private maxHistorySize = 100;

  constructor(config: Partial<ScannerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Analyzes full order book depth for liquidity patterns
   */
  analyzeOrderBook(
    bids: { price: number; size: number }[],
    asks: { price: number; size: number }[],
    currentPrice: number
  ): LiquidityAnalysis {
    const timestamp = Date.now();
    
    // Update price history for trend analysis
    this.updatePriceHistory(currentPrice);

    // Scan full depth for walls
    const bidWalls = this.scanForWalls(bids, currentPrice, 'BID');
    const askWalls = this.scanForWalls(asks, currentPrice, 'ASK');

    // Identify top walls
    const topBidWall = this.getTopWall(bidWalls);
    const topAskWall = this.getTopWall(askWalls);

    // Calculate totals
    const totalBidSize = bids.reduce((sum, level) => sum + level.size, 0);
    const totalAskSize = asks.reduce((sum, level) => sum + level.size, 0);

    console.debug('[OrderBook Scanner] Analysis complete:', {
      bidWalls: bidWalls.length,
      askWalls: askWalls.length,
      topBidWall: topBidWall ? `${topBidWall.side}@${topBidWall.price} (${topBidWall.size.toFixed(1)} BTC)` : null,
      topAskWall: topAskWall ? `${topAskWall.side}@${topAskWall.price} (${topAskWall.size.toFixed(1)} BTC)` : null,
      totalBidSize: totalBidSize.toFixed(1),
      totalAskSize: totalAskSize.toFixed(1),
      scanDepth: `${(this.config.maxDepth * 100).toFixed(1)}%`
    });

    return {
      bidWalls,
      askWalls,
      topBidWall,
      topAskWall,
      currentPrice,
      totalBidSize,
      totalAskSize,
      timestamp
    };
  }

  /**
   * Scans one side of the order book for liquidity walls
   */
  private scanForWalls(
    levels: { price: number; size: number }[],
    currentPrice: number,
    side: 'BID' | 'ASK'
  ): LiquidityWall[] {
    const walls: LiquidityWall[] = [];
    const avgSize = this.calculateAverageSize(levels);
    const scanRange = currentPrice * this.config.maxDepth;

    // Filter levels within scanning range
    const relevantLevels = levels.filter(level => {
      const distance = Math.abs(level.price - currentPrice) / currentPrice;
      return distance <= this.config.maxDepth && level.size >= this.config.minWallSize;
    });

    // Group nearby levels to detect concentration
    const clusters = this.detectLiquidityClusters(relevantLevels);

    // Analyze each cluster for wall/magnet potential
    clusters.forEach(cluster => {
      const totalSize = cluster.reduce((sum, level) => sum + level.size, 0);
      const avgPrice = cluster.reduce((sum, level) => sum + level.price, 0) / cluster.length;
      const concentration = this.calculateConcentration(cluster, totalSize);
      const distance = Math.abs(avgPrice - currentPrice) / currentPrice;

      // Determine wall type based on size and concentration
      let type: LiquidityWall['type'] = 'NORMAL';
      if (totalSize >= this.config.minWallSize && concentration >= this.config.wallDensityThreshold) {
        type = 'WALL';
      } else if (totalSize >= avgSize * this.config.magnetThreshold) {
        type = 'MAGNET';
      }

      // Calculate strength based on size, concentration, and distance
      const strength = this.calculateStrength(totalSize, concentration, distance, avgSize);

      walls.push({
        price: avgPrice,
        size: totalSize,
        side,
        type,
        strength,
        distance
      });
    });

    // Sort by strength (strongest first)
    return walls.sort((a, b) => b.strength - a.strength);
  }

  /**
   * Detects clusters of liquidity at nearby price levels
   */
  private detectLiquidityClusters(levels: { price: number; size: number }[]): { price: number; size: number }[][] {
    if (levels.length === 0) return [];

    const clusters: { price: number; size: number }[][] = [];
    const clusterThreshold = 0.001; // 0.1% price difference for clustering
    let currentCluster: { price: number; size: number }[] = [levels[0]];

    for (let i = 1; i < levels.length; i++) {
      const currentLevel = levels[i];
      const lastLevelInCluster = currentCluster[currentCluster.length - 1];
      
      const priceDiff = Math.abs(currentLevel.price - lastLevelInCluster.price) / lastLevelInCluster.price;
      
      if (priceDiff <= clusterThreshold) {
        currentCluster.push(currentLevel);
      } else {
        clusters.push(currentCluster);
        currentCluster = [currentLevel];
      }
    }
    
    clusters.push(currentCluster);
    return clusters;
  }

  /**
   * Calculates average order size for normalization
   */
  private calculateAverageSize(levels: { price: number; size: number }[]): number {
    if (levels.length === 0) return 0;
    const totalSize = levels.reduce((sum, level) => sum + level.size, 0);
    return totalSize / levels.length;
  }

  /**
   * Calculates concentration of liquidity in a cluster
   */
  private calculateConcentration(cluster: { price: number; size: number }[], totalSize: number): number {
    if (cluster.length <= 1) return 1;
    
    // Calculate how concentrated the size is in the cluster
    const maxSize = Math.max(...cluster.map(l => l.size));
    const concentration = maxSize / totalSize;
    
    return concentration;
  }

  /**
   * Calculates strength score for a liquidity wall
   */
  private calculateStrength(
    size: number,
    concentration: number,
    distance: number,
    avgSize: number
  ): number {
    // Size factor (60% weight)
    const sizeFactor = Math.min(size / (avgSize * 10), 1);
    
    // Concentration factor (25% weight)
    const concentrationFactor = concentration;
    
    // Distance factor (15% weight) - closer is stronger
    const distanceFactor = Math.max(0, 1 - distance / this.config.maxDepth);
    
    const strength = (sizeFactor * 0.6) + (concentrationFactor * 0.25) + (distanceFactor * 0.15);
    
    return Math.min(strength, 1);
  }

  /**
   * Gets the strongest wall from an array
   */
  private getTopWall(walls: LiquidityWall[]): LiquidityWall | null {
    if (walls.length === 0) return null;
    return walls.reduce((strongest, current) => 
      current.strength > strongest.strength ? current : strongest
    );
  }

  /**
   * Updates price history for trend analysis
   */
  private updatePriceHistory(price: number): void {
    this.priceHistory.push(price);
    if (this.priceHistory.length > this.maxHistorySize) {
      this.priceHistory.shift();
    }
  }

  /**
   * Gets price trend for additional context
   */
  getPriceTrend(): 'UP' | 'DOWN' | 'SIDEWAYS' {
    if (this.priceHistory.length < 10) return 'SIDEWAYS';
    
    const recent = this.priceHistory.slice(-10);
    const older = this.priceHistory.slice(-20, -10);
    
    if (older.length === 0) return 'SIDEWAYS';
    
    const recentAvg = recent.reduce((sum, p) => sum + p, 0) / recent.length;
    const olderAvg = older.reduce((sum, p) => sum + p, 0) / older.length;
    
    const change = (recentAvg - olderAvg) / olderAvg;
    
    if (change > 0.001) return 'UP';
    if (change < -0.001) return 'DOWN';
    return 'SIDEWAYS';
  }
}
