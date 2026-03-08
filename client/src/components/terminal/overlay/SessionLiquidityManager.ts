import { detectLiquiditySweep, calculateRelevanceScore } from "./renderers/sessionLiquidity";

export interface SessionLiquidityLevel {
  side: 'BID' | 'ASK';
  price: number;
  maxSize: number;
  persistence: number; // milliseconds
  firstSeen: number;
  lastSeen: number;
  stillActive: boolean;
  relevanceScore?: number;
  magnetScore?: number;
  distanceToSpot?: number;
  totalLiquidityBTC?: number;
  orderCount?: number;
  refillCount?: number;
  stabilityScore?: number;
  sessionRelevanceScore?: number;
  maxLiquidityBTCEverSeen?: number; // NEW: Track maximum liquidity ever seen
}

export interface LiquiditySweep {
  price: number;
  side: 'BID' | 'ASK';
  direction: 'UP' | 'DOWN';
  timestamp: number;
  wallPrice: number;
  wallSize: number;
}

export interface SessionLiquidityState {
  passiveLevels: SessionLiquidityLevel[];
  activeMagnet: SessionLiquidityLevel | null;
  recentSweeps: LiquiditySweep[];
  lastUpdate: number;
}

export class SessionLiquidityManager {
  private state: SessionLiquidityState = {
    passiveLevels: [],
    activeMagnet: null,
    recentSweeps: [],
    lastUpdate: Date.now()
  };

  private readonly MAX_LEVELS = 50;
  private readonly MAX_SWEEPS = 10;
  private readonly STALE_TIMEOUT = 30000; // 30 seconds
  private readonly MIN_RELEVANCE_THRESHOLD = 0.1;
  private readonly MIN_MAGNET_THRESHOLD = 0.3;
  private readonly TICK_RANGE = 2; // ±2 ticks for aggregation
  private readonly MIN_SESSION_RELEVANCE_THRESHOLD = 0.05;
  private readonly MIN_BTC_TO_RENDER = 5; // Minimum BTC to render a level
  private readonly CLUSTER_PERCENTAGE = 0.0002; // 0.02% for price clustering

  private aggregateLiquidityAtLevel(
    targetPrice: number, 
    side: 'BID' | 'ASK', 
    allOrders: { price: number; size: number }[]
  ): { totalLiquidityBTC: number; orderCount: number } {
    // Aggregate orders within tick range
    const tickSize = this.getTickSize(targetPrice);
    const minPrice = targetPrice - (this.TICK_RANGE * tickSize);
    const maxPrice = targetPrice + (this.TICK_RANGE * tickSize);

    const relevantOrders = allOrders.filter(order => {
      if (side === 'BID') {
        return order.price <= targetPrice && order.price >= minPrice;
      } else {
        return order.price >= targetPrice && order.price <= maxPrice;
      }
    });

    const totalLiquidityBTC = relevantOrders.reduce((sum, order) => sum + order.size, 0);
    const orderCount = relevantOrders.length;

    console.debug('[Session Liquidity] Liquidity aggregation:', {
      side,
      targetPrice,
      tickSize,
      minPrice,
      maxPrice,
      relevantOrdersCount: orderCount,
      totalLiquidityBTC
    });

    return { totalLiquidityBTC, orderCount };
  }

  private getTickSize(price: number): number {
    // Approximate tick sizes for BTC
    if (price >= 100000) return 10;
    if (price >= 10000) return 1;
    if (price >= 1000) return 0.1;
    if (price >= 100) return 0.01;
    return 0.001;
  }

  private clusterLiquidityLevels(levels: SessionLiquidityLevel[], currentPrice: number): SessionLiquidityLevel[] {
    if (levels.length === 0) return [];
    
    // Sort by price
    const sortedLevels = [...levels].sort((a, b) => a.price - b.price);
    const clusters: SessionLiquidityLevel[][] = [];
    
    // Group levels into clusters
    for (const level of sortedLevels) {
      const clusterRange = Math.max(5, currentPrice * this.CLUSTER_PERCENTAGE);
      
      // Find existing cluster for this level
      const existingCluster = clusters.find(cluster => {
        const avgPrice = cluster.reduce((sum, l) => sum + l.price, 0) / cluster.length;
        return Math.abs(level.price - avgPrice) <= clusterRange;
      });
      
      if (existingCluster) {
        existingCluster.push(level);
      } else {
        clusters.push([level]);
      }
    }
    
    // Merge each cluster into a single level
    const mergedLevels: SessionLiquidityLevel[] = [];
    
    clusters.forEach(cluster => {
      if (cluster.length === 1) {
        mergedLevels.push(cluster[0]);
      } else {
        // Merge cluster into single level
        const merged: SessionLiquidityLevel = {
          side: cluster[0].side,
          price: cluster.reduce((sum, l) => sum + l.price * (l.totalLiquidityBTC || 0), 0) / 
                 cluster.reduce((sum, l) => sum + (l.totalLiquidityBTC || 0), 0), // Weighted average price
          maxSize: Math.max(...cluster.map(l => l.maxSize)),
          persistence: Math.max(...cluster.map(l => l.persistence)),
          firstSeen: Math.min(...cluster.map(l => l.firstSeen)),
          lastSeen: Math.max(...cluster.map(l => l.lastSeen)),
          stillActive: cluster.some(l => l.stillActive),
          totalLiquidityBTC: cluster.reduce((sum, l) => sum + (l.totalLiquidityBTC || 0), 0),
          orderCount: cluster.reduce((sum, l) => sum + (l.orderCount || 0), 0),
          refillCount: Math.max(...cluster.map(l => l.refillCount || 1)),
          stabilityScore: cluster.reduce((sum, l) => sum + (l.stabilityScore || 0), 0) / cluster.length,
          sessionRelevanceScore: 0,
          magnetScore: 0,
          distanceToSpot: cluster.reduce((sum, l) => sum + (l.distanceToSpot || 0), 0) / cluster.length,
          maxLiquidityBTCEverSeen: Math.max(...cluster.map(l => l.maxLiquidityBTCEverSeen || 0)) // Preserve max liquidity
        };
        
        console.debug('[Session Liquidity] Merged cluster:', {
          side: merged.side,
          clusterSize: cluster.length,
          originalPrices: cluster.map(l => l.price),
          mergedPrice: merged.price,
          totalLiquidityBTC: merged.totalLiquidityBTC?.toFixed(2),
          maxLiquidityBTCEverSeen: merged.maxLiquidityBTCEverSeen?.toFixed(2),
          orderCount: merged.orderCount
        });
        
        mergedLevels.push(merged);
      }
    });
    
    return mergedLevels;
  }

  updateOrderbook(bids: { price: number; size: number }[], asks: { price: number; size: number }[], currentPrice: number): void {
    const now = Date.now();
    
    // LOG RAW ORDERBOOK LEVELS BEFORE FILTERING
    console.log('[Session Liquidity Debug] RAW ORDERBOOK LEVELS:');
    console.log('--- BIDS ---');
    bids.forEach((bid, index) => {
      const sizeBTC = bid.size * bid.price;
      console.log(`bid ${index}: price=${bid.price}, sizeBTC=${sizeBTC.toFixed(4)}, side=BID`);
    });
    console.log('--- ASKS ---');
    asks.forEach((ask, index) => {
      const sizeBTC = ask.size * ask.price;
      console.log(`ask ${index}: price=${ask.price}, sizeBTC=${sizeBTC.toFixed(4)}, side=ASK`);
    });
    
    // LOG THRESHOLD VALUES
    console.log('[Session Liquidity Debug] THRESHOLDS:');
    console.log('minLiquidityBTC:', this.MIN_BTC_TO_RENDER);
    console.log('clusteringDistance:', `max(5, ${currentPrice} * ${this.CLUSTER_PERCENTAGE}) = ${Math.max(5, currentPrice * this.CLUSTER_PERCENTAGE)}`);
    console.log('maxLevelsTracked:', this.MAX_LEVELS);
    
    // Update bid levels
    bids.forEach(bid => {
      this.updatePassiveLevel('BID', bid.price, bid.size, now, currentPrice, bids);
    });
    
    // Update ask levels  
    asks.forEach(ask => {
      this.updatePassiveLevel('ASK', ask.price, ask.size, now, currentPrice, asks);
    });
    
    // Clean stale levels
    this.cleanStaleLevels(now);
    
    // Cluster nearby levels
    const clusteredLevels = this.clusterLiquidityLevels(this.state.passiveLevels, currentPrice);
    this.state.passiveLevels = clusteredLevels;
    
    console.debug('[Session Liquidity] KEY METRICS:', {
      trackedSessionWallsLength: this.state.passiveLevels.length,
      trackedSessionWalls: this.state.passiveLevels.map(l => ({
        side: l.side,
        price: l.price,
        totalLiquidityBTC: l.totalLiquidityBTC?.toFixed(2),
        maxLiquidityBTCEverSeen: l.maxLiquidityBTCEverSeen?.toFixed(2),
        stillActive: l.stillActive,
        lastSeen: new Date(l.lastSeen).toISOString(),
        age: Math.floor((Date.now() - l.firstSeen) / 1000) // seconds
      }))
    });
    
    console.debug('[Session Liquidity] After clustering:', {
      originalCount: this.state.passiveLevels.length,
      clusteredCount: clusteredLevels.length,
      levels: clusteredLevels.map(l => ({
        side: l.side,
        price: l.price,
        totalLiquidityBTC: l.totalLiquidityBTC?.toFixed(2),
        maxLiquidityBTCEverSeen: l.maxLiquidityBTCEverSeen?.toFixed(2),
        stillActive: l.stillActive
      }))
    });
    
    // Update relevance scores and magnet scores
    this.updateSessionRelevanceScores(currentPrice);
    this.updateActiveMagnetScores(currentPrice);
    
    // Find top session levels and active magnet
    this.findTopSessionLevels();
    this.findActiveMagnet();
    
    // COMPREHENSIVE DEBUG LOGGING
    this.logSessionWallsDebugInfo();
    
    // Detect sweeps
    this.detectSweeps(currentPrice);
    
    this.state.lastUpdate = now;
  }

  private updatePassiveLevel(
    side: 'BID' | 'ASK', 
    price: number, 
    size: number, 
    now: number, 
    currentPrice: number,
    allOrders: { price: number; size: number }[]
  ): void {
    let level = this.state.passiveLevels.find(l => l.side === side && Math.abs(l.price - price) < 0.01);
    
    if (!level) {
      // Create new level with liquidity aggregation
      const liquidity = this.aggregateLiquidityAtLevel(price, side, allOrders);
      
      level = {
        side,
        price,
        maxSize: size,
        persistence: 0,
        firstSeen: now,
        lastSeen: now,
        stillActive: true,
        distanceToSpot: Math.abs(price - currentPrice),
        totalLiquidityBTC: liquidity.totalLiquidityBTC,
        orderCount: liquidity.orderCount,
        refillCount: 1,
        stabilityScore: 1.0, // Perfect stability for new level
        sessionRelevanceScore: 0,
        maxLiquidityBTCEverSeen: liquidity.totalLiquidityBTC // Track max from start
      };
      this.state.passiveLevels.push(level);
      
      console.debug('[Session Liquidity] Created new session wall:', {
        side: level.side,
        price: level.price,
        totalLiquidityBTC: level.totalLiquidityBTC?.toFixed(2),
        maxLiquidityBTCEverSeen: level.maxLiquidityBTCEverSeen?.toFixed(2),
        stillActive: level.stillActive
      });
    } else {
      // Update existing level with fresh liquidity aggregation
      const liquidity = this.aggregateLiquidityAtLevel(price, side, allOrders);
      
      // Track maximum liquidity ever seen
      if (liquidity.totalLiquidityBTC > (level.maxLiquidityBTCEverSeen || 0)) {
        level.maxLiquidityBTCEverSeen = liquidity.totalLiquidityBTC;
        console.debug('[Session Liquidity] Updated max liquidity ever seen:', {
          side: level.side,
          price: level.price,
          previousMax: (level.maxLiquidityBTCEverSeen - liquidity.totalLiquidityBTC)?.toFixed(2),
          newMax: level.maxLiquidityBTCEverSeen?.toFixed(2)
        });
      }
      
      // Track refills (when liquidity returns after being reduced)
      const currentLiquidity = liquidity.totalLiquidityBTC;
      const previousLiquidity = level.totalLiquidityBTC || 0;
      if (currentLiquidity > previousLiquidity * 1.1) { // 10% increase threshold
        level.refillCount = (level.refillCount || 1) + 1;
      }
      
      // Calculate stability (consistency of liquidity over time)
      const age = now - level.firstSeen;
      const avgLiquidity = level.totalLiquidityBTC ? 
        (level.totalLiquidityBTC * level.persistence + currentLiquidity * (now - level.lastSeen)) / (level.persistence + (now - level.lastSeen)) :
        currentLiquidity;
      level.stabilityScore = avgLiquidity > 0 ? 1 - Math.abs(currentLiquidity - avgLiquidity) / avgLiquidity : 0;
      
      level.maxSize = Math.max(level.maxSize, size);
      level.lastSeen = now;
      level.stillActive = true;
      level.persistence += now - level.lastSeen;
      level.distanceToSpot = Math.abs(price - currentPrice);
      level.totalLiquidityBTC = liquidity.totalLiquidityBTC;
      level.orderCount = liquidity.orderCount;
      
      console.debug('[Session Liquidity] Updated session wall:', {
        side: level.side,
        price: level.price,
        totalLiquidityBTC: level.totalLiquidityBTC?.toFixed(2),
        maxLiquidityBTCEverSeen: level.maxLiquidityBTCEverSeen?.toFixed(2),
        orderCount: level.orderCount,
        refillCount: level.refillCount,
        stabilityScore: level.stabilityScore?.toFixed(3),
        stillActive: level.stillActive,
        age: age
      });
    }
  }

  private cleanStaleLevels(now: number): void {
    this.state.passiveLevels = this.state.passiveLevels.filter(level => {
      const isStale = (now - level.lastSeen) > this.STALE_TIMEOUT;
      if (isStale) {
        level.stillActive = false;
      }
      return level.persistence > 0 || level.stillActive;
    });
    
    // Keep only top levels by relevance
    this.state.passiveLevels.sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0));
    this.state.passiveLevels = this.state.passiveLevels.slice(0, this.MAX_LEVELS);
  }

  private updateSessionRelevanceScores(currentPrice: number): void {
    const maxSize = Math.max(...this.state.passiveLevels.map(l => l.maxSize));
    const maxPersistence = Math.max(...this.state.passiveLevels.map(l => l.persistence));
    const maxRefillCount = Math.max(...this.state.passiveLevels.map(l => l.refillCount || 1));
    
    this.state.passiveLevels.forEach(level => {
      // Session Relevance: Focus on overall importance, not proximity
      const sizeScore = maxSize > 0 ? (level.maxSize / maxSize) * 0.4 : 0;           // 40% weight
      const persistenceScore = maxPersistence > 0 ? (level.persistence / maxPersistence) * 0.3 : 0; // 30% weight
      const refillScore = maxRefillCount > 0 ? ((level.refillCount || 1) / maxRefillCount) * 0.2 : 0; // 20% weight
      const stabilityScore = (level.stabilityScore || 0) * 0.1;                       // 10% weight
      const activeScore = level.stillActive ? 0.0 : -0.5; // Small penalty for inactive levels
      
      level.sessionRelevanceScore = Math.max(0, sizeScore + persistenceScore + refillScore + stabilityScore + activeScore);
      
      console.debug('[Session Liquidity] Session relevance score calculation:', {
        side: level.side,
        price: level.price,
        sizeScore: sizeScore.toFixed(3),
        persistenceScore: persistenceScore.toFixed(3),
        refillScore: refillScore.toFixed(3),
        stabilityScore: stabilityScore.toFixed(3),
        activeScore: activeScore.toFixed(3),
        totalSessionRelevanceScore: level.sessionRelevanceScore?.toFixed(3),
        stillActive: level.stillActive
      });
    });
  }

  private updateActiveMagnetScores(currentPrice: number): void {
    const maxSessionRelevance = Math.max(...this.state.passiveLevels.map(l => l.sessionRelevanceScore || 0));
    const maxDistance = Math.max(...this.state.passiveLevels.map(l => l.distanceToSpot || 0));
    
    this.state.passiveLevels.forEach(level => {
      // Active Magnet: Focus on immediate attractiveness to price
      const relevanceScore = maxSessionRelevance > 0 ? (level.sessionRelevanceScore || 0) / maxSessionRelevance * 0.4 : 0; // 40% weight
      const activeScore = level.stillActive ? 0.3 : 0; // 30% weight - must be active
      const proximityScore = maxDistance > 0 ? (1 - (level.distanceToSpot || 0) / maxDistance) * 0.3 : 0; // 30% weight
      
      level.magnetScore = relevanceScore + activeScore + proximityScore;
      
      console.debug('[Session Liquidity] Active magnet score calculation:', {
        side: level.side,
        price: level.price,
        relevanceScore: relevanceScore.toFixed(3),
        activeScore: activeScore.toFixed(3),
        proximityScore: proximityScore.toFixed(3),
        totalMagnetScore: level.magnetScore?.toFixed(3),
        stillActive: level.stillActive
      });
    });
  }

  private findTopSessionLevels(): void {
    const topLevels = this.state.passiveLevels
      .filter(l => (l.sessionRelevanceScore || 0) > this.MIN_SESSION_RELEVANCE_THRESHOLD)
      .sort((a, b) => (b.sessionRelevanceScore || 0) - (a.sessionRelevanceScore || 0))
      .slice(0, 3);
    
    console.debug('[Session Liquidity] TOP SESSION WALLS:', {
      totalLevels: this.state.passiveLevels.length,
      threshold: this.MIN_SESSION_RELEVANCE_THRESHOLD,
      topSessionWalls: topLevels.map(l => ({
        side: l.side,
        price: l.price,
        sessionRelevanceScore: l.sessionRelevanceScore?.toFixed(3),
        totalLiquidityBTC: l.totalLiquidityBTC?.toFixed(2),
        maxLiquidityBTCEverSeen: l.maxLiquidityBTCEverSeen?.toFixed(2),
        stillActive: l.stillActive,
        persistence: Math.floor(l.persistence / 1000) // seconds
      }))
    });
  }

  private findActiveMagnet(): void {
    const activeLevels = this.state.passiveLevels.filter(l => 
      l.stillActive && 
      (l.magnetScore || 0) > this.MIN_MAGNET_THRESHOLD
    );
    
    console.debug('[Session Liquidity] ACTIVE MAGNET CANDIDATES:', {
      activeLevelsCount: activeLevels.length,
      minThreshold: this.MIN_MAGNET_THRESHOLD,
      candidates: activeLevels.map(l => ({
        side: l.side,
        price: l.price,
        sessionRelevanceScore: l.sessionRelevanceScore?.toFixed(3),
        magnetScore: l.magnetScore?.toFixed(3),
        totalLiquidityBTC: l.totalLiquidityBTC?.toFixed(2),
        maxLiquidityBTCEverSeen: l.maxLiquidityBTCEverSeen?.toFixed(3),
        stillActive: l.stillActive,
        distanceToSpot: l.distanceToSpot?.toFixed(2)
      }))
    });

    if (activeLevels.length > 0) {
      activeLevels.sort((a, b) => (b.magnetScore || 0) - (a.magnetScore || 0));
      const previousMagnet = this.state.activeMagnet;
      this.state.activeMagnet = activeLevels[0];
      
      console.debug('[Session Liquidity] ACTIVE MAGNET SELECTED:', {
        side: this.state.activeMagnet.side,
        price: this.state.activeMagnet.price,
        sessionRelevanceScore: this.state.activeMagnet.sessionRelevanceScore?.toFixed(3),
        magnetScore: this.state.activeMagnet.magnetScore?.toFixed(3),
        totalLiquidityBTC: this.state.activeMagnet.totalLiquidityBTC?.toFixed(2),
        maxLiquidityBTCEverSeen: this.state.activeMagnet.maxLiquidityBTCEverSeen?.toFixed(2),
        stillActive: this.state.activeMagnet.stillActive,
        previousMagnet: previousMagnet ? `${previousMagnet.side}@${previousMagnet.price}` : 'none'
      });
    } else {
      console.debug('[Session Liquidity] NO ACTIVE MAGNET FOUND - no levels passed threshold');
      this.state.activeMagnet = null;
    }
  }

  private logSessionWallsDebugInfo(): void {
    // Separate BID and ASK walls
    const bidWalls = this.state.passiveLevels.filter(l => l.side === 'BID');
    const askWalls = this.state.passiveLevels.filter(l => l.side === 'ASK');
    
    // 1) Total tracked session walls by side
    console.log('[Session Liquidity Debug] trackedBidWalls.length:', bidWalls.length);
    console.log('[Session Liquidity Debug] trackedAskWalls.length:', askWalls.length);
    
    // 2) Top BID session walls
    const topBidWalls = bidWalls
      .filter(l => (l.sessionRelevanceScore || 0) > this.MIN_SESSION_RELEVANCE_THRESHOLD)
      .sort((a, b) => (b.sessionRelevanceScore || 0) - (a.sessionRelevanceScore || 0))
      .slice(0, 2)
      .map(wall => ({
        side: wall.side,
        price: wall.price,
        maxLiquidityBTC: wall.maxLiquidityBTCEverSeen || 0,
        sessionRelevanceScore: wall.sessionRelevanceScore || 0
      }));
    
    // 3) Top ASK session walls
    const topAskWalls = askWalls
      .filter(l => (l.sessionRelevanceScore || 0) > this.MIN_SESSION_RELEVANCE_THRESHOLD)
      .sort((a, b) => (b.sessionRelevanceScore || 0) - (a.sessionRelevanceScore || 0))
      .slice(0, 2)
      .map(wall => ({
        side: wall.side,
        price: wall.price,
        maxLiquidityBTC: wall.maxLiquidityBTCEverSeen || 0,
        sessionRelevanceScore: wall.sessionRelevanceScore || 0
      }));
    
    console.log('[Session Liquidity Debug] topBidSessionWalls:', JSON.stringify(topBidWalls, null, 2));
    console.log('[Session Liquidity Debug] topAskSessionWalls:', JSON.stringify(topAskWalls, null, 2));
    
    // 4) Strongest walls by side
    const strongestBid = bidWalls.length > 0 ? 
      bidWalls.reduce((best, current) => (current.maxLiquidityBTCEverSeen || 0) > (best.maxLiquidityBTCEverSeen || 0) ? current : best) : null;
    
    const strongestAsk = askWalls.length > 0 ? 
      askWalls.reduce((best, current) => (current.maxLiquidityBTCEverSeen || 0) > (best.maxLiquidityBTCEverSeen || 0) ? current : best) : null;
    
    console.log('[Session Liquidity Debug] strongestBidWall:', strongestBid ? {
      side: strongestBid.side,
      price: strongestBid.price,
      maxLiquidityBTC: strongestBid.maxLiquidityBTCEverSeen,
      sessionRelevanceScore: strongestBid.sessionRelevanceScore
    } : 'null');
    
    console.log('[Session Liquidity Debug] strongestAskWall:', strongestAsk ? {
      side: strongestAsk.side,
      price: strongestAsk.price,
      maxLiquidityBTC: strongestAsk.maxLiquidityBTCEverSeen,
      sessionRelevanceScore: strongestAsk.sessionRelevanceScore
    } : 'null');
    
    // 5) Max liquidity ever seen by side
    const maxBidLiquidity = Math.max(...bidWalls.map(l => l.maxLiquidityBTCEverSeen || 0));
    const maxAskLiquidity = Math.max(...askWalls.map(l => l.maxLiquidityBTCEverSeen || 0));
    
    console.log('[Session Liquidity Debug] maxBidLiquidityBTCEverSeen:', maxBidLiquidity);
    console.log('[Session Liquidity Debug] maxAskLiquidityBTCEverSeen:', maxAskLiquidity);
    
    // 6) Full list of tracked session walls by side
    const trackedBidWalls = bidWalls.map(wall => ({
      side: wall.side,
      price: wall.price,
      maxLiquidityBTC: wall.maxLiquidityBTCEverSeen || 0,
      currentLiquidityBTC: wall.totalLiquidityBTC || 0,
      persistenceDuration: Math.floor(wall.persistence / 1000) + 's',
      refillCount: wall.refillCount || 1,
      firstSeen: new Date(wall.firstSeen).toISOString(),
      lastSeen: new Date(wall.lastSeen).toISOString(),
      stillActive: wall.stillActive,
      sessionRelevanceScore: wall.sessionRelevanceScore || 0
    }));
    
    const trackedAskWalls = askWalls.map(wall => ({
      side: wall.side,
      price: wall.price,
      maxLiquidityBTC: wall.maxLiquidityBTCEverSeen || 0,
      currentLiquidityBTC: wall.totalLiquidityBTC || 0,
      persistenceDuration: Math.floor(wall.persistence / 1000) + 's',
      refillCount: wall.refillCount || 1,
      firstSeen: new Date(wall.firstSeen).toISOString(),
      lastSeen: new Date(wall.lastSeen).toISOString(),
      stillActive: wall.stillActive,
      sessionRelevanceScore: wall.sessionRelevanceScore || 0
    }));
    
    console.log('[Session Liquidity Debug] trackedBidWalls:', JSON.stringify(trackedBidWalls, null, 2));
    console.log('[Session Liquidity Debug] trackedAskWalls:', JSON.stringify(trackedAskWalls, null, 2));
    
    // 7) Active magnet selection
    const activeMagnet = this.state.activeMagnet ? {
      side: this.state.activeMagnet.side,
      price: this.state.activeMagnet.price,
      liquidityBTC: this.state.activeMagnet.totalLiquidityBTC || 0,
      magnetScore: this.state.activeMagnet.magnetScore || 0
    } : null;
    
    console.log('[Session Liquidity Debug] activeMagnet:', activeMagnet ? JSON.stringify(activeMagnet) : 'null');
    
    // 8) Additional context
    console.log('[Session Liquidity Debug] --- UPDATE CYCLE COMPLETE ---');
  }

  private detectSweeps(currentPrice: number): void {
    if (this.state.recentSweeps.length > 0) {
      const lastSweep = this.state.recentSweeps[0];
      const newSweep = detectLiquiditySweep(currentPrice, lastSweep.price, this.state.passiveLevels);
      
      if (newSweep) {
        this.state.recentSweeps.unshift(newSweep);
        this.state.recentSweeps = this.state.recentSweeps.slice(0, this.MAX_SWEEPS);
      }
    }
  }

  getState(): SessionLiquidityState {
    return { ...this.state };
  }

  getNormalizedLevels(): { price: number; side: "ASK" | "BID"; totalLiquidityBTC: number; sessionRelevanceScore: number }[] {
    // Normalize and deduplicate detected liquidity levels
    const normalizedLevels: { price: number; side: "ASK" | "BID"; totalLiquidityBTC: number; sessionRelevanceScore: number }[] = [];
    const seenPrices = new Set<string>();
    
    this.state.passiveLevels.forEach(level => {
      const priceKey = `${level.side}_${level.price}`;
      if (!seenPrices.has(priceKey) && (level.totalLiquidityBTC || 0) >= this.MIN_BTC_TO_RENDER) {
        normalizedLevels.push({
          price: level.price,
          side: level.side,
          totalLiquidityBTC: level.totalLiquidityBTC || 0,
          sessionRelevanceScore: level.sessionRelevanceScore || 0
        });
        seenPrices.add(priceKey);
      }
    });
    
    console.log('[Session Liquidity Debug] NORMALIZED LEVELS:');
    console.log('totalNormalized:', normalizedLevels.length);
    normalizedLevels.forEach((level, index) => {
      console.log(`normalized ${index}: side=${level.side}, price=${level.price}, totalLiquidityBTC=${level.totalLiquidityBTC.toFixed(2)}, sessionRelevanceScore=${level.sessionRelevanceScore.toFixed(3)}`);
    });
    
    return normalizedLevels;
  }

  getDeterministicRenderPlan(): {
    visibleAskWalls: any[];
    visibleBidWalls: any[];
    topOutOfRangeAsk: any;
    topOutOfRangeBid: any;
    activeMagnet: any;
  } {
    // Get normalized levels
    const normalizedLevels = this.getNormalizedLevels();
    
    // Split by side
    const askWalls = normalizedLevels.filter(l => l.side === "ASK");
    const bidWalls = normalizedLevels.filter(l => l.side === "BID");
    
    console.log('[Session Liquidity Debug] SIDE SEPARATION:');
    console.log('askWalls:', askWalls.length);
    console.log('bidWalls:', bidWalls.length);
    
    // Sort both sides by actual liquidity (primary ranking metric)
    askWalls.sort((a, b) => b.totalLiquidityBTC - a.totalLiquidityBTC);
    bidWalls.sort((a, b) => b.totalLiquidityBTC - a.totalLiquidityBTC);
    
    console.log('[Session Liquidity Debug] SORTED BY LIQUIDITY:');
    console.log('topAskWalls:', askWalls.slice(0, 3).map(l => ({ price: l.price, liquidity: l.totalLiquidityBTC })));
    console.log('topBidWalls:', bidWalls.slice(0, 3).map(l => ({ price: l.price, liquidity: l.totalLiquidityBTC })));
    
    // Get viewport (assuming current price is available from state)
    const currentPrice = this.state.activeMagnet ? this.state.activeMagnet.price : 67000; // Fallback
    const viewportRange = { min: currentPrice - 2000, max: currentPrice + 2000 }; // Estimated viewport
    
    // Detect visible walls (max 2 per side)
    const visibleAskWalls = askWalls
      .filter(l => l.price >= viewportRange.min && l.price <= viewportRange.max)
      .slice(0, 2);
      
    const visibleBidWalls = bidWalls
      .filter(l => l.price >= viewportRange.min && l.price <= viewportRange.max)
      .slice(0, 2);
    
    // Detect strongest out-of-range walls (only 1 per side)
    const outOfRangeAskWalls = askWalls.filter(l => l.price > viewportRange.max);
    const outOfRangeBidWalls = bidWalls.filter(l => l.price < viewportRange.min);
    
    const topOutOfRangeAsk = outOfRangeAskWalls.length > 0 ? outOfRangeAskWalls[0] : null;
    const topOutOfRangeBid = outOfRangeBidWalls.length > 0 ? outOfRangeBidWalls[0] : null;
    
    // Active magnet (always included)
    const activeMagnet = this.state.activeMagnet;
    
    console.log('[Session Liquidity Debug] DETERMINISTIC RENDER PLAN:');
    console.log('viewportRange:', viewportRange);
    console.log('visibleAskWalls:', visibleAskWalls.length, visibleAskWalls.map(l => ({ price: l.price, liquidity: l.totalLiquidityBTC })));
    console.log('visibleBidWalls:', visibleBidWalls.length, visibleBidWalls.map(l => ({ price: l.price, liquidity: l.totalLiquidityBTC })));
    console.log('topOutOfRangeAsk:', topOutOfRangeAsk ? { price: topOutOfRangeAsk.price, liquidity: topOutOfRangeAsk.totalLiquidityBTC } : null);
    console.log('topOutOfRangeBid:', topOutOfRangeBid ? { price: topOutOfRangeBid.price, liquidity: topOutOfRangeBid.totalLiquidityBTC } : null);
    console.log('activeMagnet:', activeMagnet ? { price: activeMagnet.price, liquidity: activeMagnet.totalLiquidityBTC } : null);
    
    return {
      visibleAskWalls,
      visibleBidWalls,
      topOutOfRangeAsk,
      topOutOfRangeBid,
      activeMagnet
    };
  }

  getInterpretation(currentPrice: number): {
    strongestAskAbove: SessionLiquidityLevel | null;
    strongestBidBelow: SessionLiquidityLevel | null;
    activeMagnet: SessionLiquidityLevel | null;
    lastSweep: LiquiditySweep | null;
    vacuumAfterSweep: boolean;
  } {
    const asksAbove = this.state.passiveLevels.filter(l => l.side === 'ASK' && l.price > currentPrice);
    const bidsBelow = this.state.passiveLevels.filter(l => l.side === 'BID' && l.price < currentPrice);
    
    const strongestAskAbove = asksAbove.length > 0 ? 
      asksAbove.reduce((best, current) => (current.sessionRelevanceScore || 0) > (best.sessionRelevanceScore || 0) ? current : best) : null;
    
    const strongestBidBelow = bidsBelow.length > 0 ? 
      bidsBelow.reduce((best, current) => (current.sessionRelevanceScore || 0) > (best.sessionRelevanceScore || 0) ? current : best) : null;

    const lastSweep = this.state.recentSweeps[0] || null;
    const vacuumAfterSweep = lastSweep && 
      (Date.now() - lastSweep.timestamp) < 60000 && // Within 1 minute
      lastSweep.direction === 'UP' && lastSweep.side === 'ASK' ||
      lastSweep.direction === 'DOWN' && lastSweep.side === 'BID';

    return {
      strongestAskAbove,
      strongestBidBelow,
      activeMagnet: this.state.activeMagnet,
      lastSweep,
      vacuumAfterSweep
    };
  }
}
