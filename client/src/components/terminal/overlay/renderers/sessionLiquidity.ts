import { OverlayRenderContext, OverlayRenderer } from "../types";

export interface SessionLiquidityLevel {
  side: 'BID' | 'ASK';
  price: number;
  maxSize: number;
  persistence: number; // milliseconds
  firstSeen: number;
  lastSeen: number;
  stillActive: boolean;
  relevanceScore?: number;
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

export const renderSessionLiquidity: OverlayRenderer = (context: OverlayRenderContext) => {
  // Session liquidity rendering handled by separate price line system
  return [];
};

export function calculateRelevanceScore(
  level: SessionLiquidityLevel,
  currentPrice: number,
  maxPersistence: number,
  maxSize: number
): number {
  const sizeScore = (level.maxSize / maxSize) * 0.4; // 40% weight
  const persistenceScore = (level.persistence / maxPersistence) * 0.3; // 30% weight
  const proximityScore = level.stillActive ? 
    Math.max(0, 1 - Math.abs(level.price - currentPrice) / currentPrice * 100) * 0.2 : 0; // 20% weight
  const activeScore = level.stillActive ? 0.1 : 0; // 10% weight
  
  return sizeScore + persistenceScore + proximityScore + activeScore;
}

export function detectLiquiditySweep(
  currentPrice: number,
  previousPrice: number,
  passiveLevels: SessionLiquidityLevel[]
): LiquiditySweep | null {
  const direction = currentPrice > previousPrice ? 'UP' : 'DOWN';
  
  // Find if price swept through any passive level
  const sweptLevel = passiveLevels.find(level => {
    const minPrice = Math.min(currentPrice, previousPrice);
    const maxPrice = Math.max(currentPrice, previousPrice);
    return level.price >= minPrice && level.price <= maxPrice && !level.stillActive;
  });
  
  if (!sweptLevel) return null;
  
  return {
    price: currentPrice,
    side: sweptLevel.side,
    direction,
    timestamp: Date.now(),
    wallPrice: sweptLevel.price,
    wallSize: sweptLevel.maxSize
  };
}
