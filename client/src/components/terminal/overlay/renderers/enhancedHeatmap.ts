/**
 * Enhanced Heatmap Renderer with Institutional Liquidity Detection
 * Renders major walls and magnet orders with clear labels
 */

import { OverlayRenderContext, OverlayRenderer } from "../types";
import { InstitutionalOrderBookScanner, LiquidityWall, LiquidityAnalysis } from "../scanners/institutionalOrderBookScanner";

export interface EnhancedHeatmapConfig {
  scannerConfig: {
    minWallSize: number;        // Minimum BTC to consider as wall
    magnetThreshold: number;    // Size ratio for magnet detection
    maxDepth: number;           // Maximum price % to scan
    wallDensityThreshold: number; // Concentration factor
  };
  rendering: {
    maxWallsPerSide: number;   // Maximum walls to display per side
    labelOpacity: number;      // Label background opacity
    lineOpacity: number;       // Line opacity
    minWallStrength: number;   // Minimum strength to display
  };
}

const DEFAULT_CONFIG: EnhancedHeatmapConfig = {
  scannerConfig: {
    minWallSize: 15,           // 15 BTC minimum for institutional walls
    magnetThreshold: 2.5,      // 2.5x average size for magnets
    maxDepth: 0.08,            // 8% price range for deep scanning
    wallDensityThreshold: 0.6  // 60% concentration for walls
  },
  rendering: {
    maxWallsPerSide: 4,        // Show top 4 walls per side
    labelOpacity: 0.9,         // Clear label visibility
    lineOpacity: 0.7,          // Strong line visibility
    minWallStrength: 0.3       // Minimum strength to display
  }
};

export class EnhancedHeatmapRenderer {
  private scanner: InstitutionalOrderBookScanner;
  private config: EnhancedHeatmapConfig;
  private lastAnalysis: LiquidityAnalysis | null = null;

  constructor(config: Partial<EnhancedHeatmapConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.scanner = new InstitutionalOrderBookScanner(this.config.scannerConfig);
  }

  /**
   * Main rendering function for enhanced heatmap
   */
  render(context: OverlayRenderContext): OverlayRenderer {
    return (ctx) => {
      if (!context.activePanels.has("HEATMAP")) {
        return []; // Don't render if HEATMAP panel is not active
      }

      const { positioning_engines, lastCandle } = ctx;
      const currentPrice = lastCandle?.close || 0;

      if (!currentPrice || !positioning_engines?.liquidityHeatmap) {
        return [];
      }

      // Get order book data from positioning engines
      const orderBookData = this.extractOrderBookData(positioning_engines);
      
      if (!orderBookData) {
        return [];
      }

      // Analyze order book for major walls
      const analysis = this.scanner.analyzeOrderBook(
        orderBookData.bids,
        orderBookData.asks,
        currentPrice
      );

      this.lastAnalysis = analysis;

      // Render major walls with labels
      return this.renderMajorWalls(analysis, ctx);
    };
  }

  /**
   * Extracts order book data from positioning engines
   */
  private extractOrderBookData(positioning_engines: any): { bids: { price: number; size: number }[], asks: { price: number; size: number }[] } | null {
    const heatmap = positioning_engines.liquidityHeatmap;
    
    if (!heatmap || !heatmap.liquidityHeatZones) {
      return null;
    }

    // Convert heatmap zones to order book format
    const bids: { price: number; size: number }[] = [];
    const asks: { price: number; size: number }[] = [];

    heatmap.liquidityHeatZones.forEach((zone: any) => {
      const midPrice = (zone.priceStart + zone.priceEnd) / 2;
      const size = zone.totalSize || zone.intensity * 100; // Convert intensity to estimated BTC size
      
      if (zone.side === 'BID') {
        bids.push({ price: midPrice, size });
      } else if (zone.side === 'ASK') {
        asks.push({ price: midPrice, size });
      }
    });

    // Sort properly
    bids.sort((a, b) => b.price - a.price);
    asks.sort((a, b) => a.price - b.price);

    return { bids, asks };
  }

  /**
   * Renders major liquidity walls with labels
   */
  private renderMajorWalls(analysis: LiquidityAnalysis, ctx: any): any[] {
    const entries: any[] = [];

    // Render top bid walls
    const topBidWalls = analysis.bidWalls
      .filter(wall => wall.strength >= this.config.rendering.minWallStrength)
      .slice(0, this.config.rendering.maxWallsPerSide);

    topBidWalls.forEach(wall => {
      const entry = this.createWallEntry(wall, ctx);
      if (entry) entries.push(entry);
    });

    // Render top ask walls
    const topAskWalls = analysis.askWalls
      .filter(wall => wall.strength >= this.config.rendering.minWallStrength)
      .slice(0, this.config.rendering.maxWallsPerSide);

    topAskWalls.forEach(wall => {
      const entry = this.createWallEntry(wall, ctx);
      if (entry) entries.push(entry);
    });

    console.debug('[Enhanced Heatmap] Rendered major walls:', {
      bidWalls: topBidWalls.length,
      askWalls: topAskWalls.length,
      totalEntries: entries.length,
      topBidWall: analysis.topBidWall ? `${analysis.topBidWall.side}@${analysis.topBidWall.price} (${analysis.topBidWall.size.toFixed(1)} BTC)` : null,
      topAskWall: analysis.topAskWall ? `${analysis.topAskWall.side}@${analysis.topAskWall.price} (${analysis.topAskWall.size.toFixed(1)} BTC)` : null
    });

    return entries;
  }

  /**
   * Creates a price line entry for a liquidity wall
   */
  private createWallEntry(wall: LiquidityWall, ctx: any): any | null {
    const { candleSeriesRef, LineStyle } = ctx;

    if (!candleSeriesRef?.current) {
      return null;
    }

    // Determine visual properties based on wall type
    const { color, lineWidth, lineStyle, label } = this.getWallVisualProperties(wall);

    // Create price line
    const priceLine = candleSeriesRef.current.createPriceLine({
      price: wall.price,
      color,
      lineWidth,
      lineStyle,
      axisLabelVisible: true,
      title: label
    });

    if (!priceLine) {
      console.error('[Enhanced Heatmap] Failed to create price line for wall:', wall);
      return null;
    }

    return {
      type: 'priceLine',
      element: priceLine,
      wall
    };
  }

  /**
   * Determines visual properties for a wall based on its characteristics
   */
  private getWallVisualProperties(wall: LiquidityWall): {
    color: string;
    lineWidth: number;
    lineStyle: number;
    label: string;
  } {
    const { LineStyle } = window as any; // Access from global scope
    
    // Base color on side
    const baseColor = wall.side === 'BID' ? '34, 197, 94' : '239, 68, 68'; // Green for BID, Red for ASK
    
    // Adjust opacity based on strength
    const opacity = 0.4 + (wall.strength * 0.6); // 40% to 100% opacity based on strength
    const color = `rgba(${baseColor}, ${opacity})`;
    
    // Line properties based on type
    let lineWidth = 2;
    let lineStyle = LineStyle.Solid;
    let typeLabel = 'WALL';
    
    if (wall.type === 'MAGNET') {
      lineWidth = 3;
      lineStyle = LineStyle.Solid;
      typeLabel = 'MAGNET';
    } else if (wall.type === 'WALL') {
      lineWidth = 2.5;
      lineStyle = LineStyle.Dashed;
    } else {
      lineWidth = 1.5;
      lineStyle = LineStyle.Dotted;
    }
    
    // Create label
    const label = `${wall.side} ${typeLabel} ${wall.price.toFixed(0)} · ${wall.size.toFixed(1)} BTC`;
    
    return { color, lineWidth, lineStyle, label };
  }

  /**
   * Gets the latest analysis results
   */
  getLastAnalysis(): LiquidityAnalysis | null {
    return this.lastAnalysis;
  }

  /**
   * Gets wall summary for display
   */
  getWallSummary(): {
    topBidWall: string | null;
    topAskWall: string | null;
    totalWalls: number;
    priceTrend: string;
  } {
    if (!this.lastAnalysis) {
      return {
        topBidWall: null,
        topAskWall: null,
        totalWalls: 0,
        priceTrend: 'SIDEWAYS'
      };
    }

    const { topBidWall, topAskWall, bidWalls, askWalls } = this.lastAnalysis;
    const priceTrend = this.scanner.getPriceTrend();

    return {
      topBidWall: topBidWall ? `${topBidWall.side}@${topBidWall.price} (${topBidWall.size.toFixed(1)} BTC)` : null,
      topAskWall: topAskWall ? `${topAskWall.side}@${topAskWall.price} (${topAskWall.size.toFixed(1)} BTC)` : null,
      totalWalls: bidWalls.length + askWalls.length,
      priceTrend
    };
  }
}

// Export the enhanced renderer as the default heatmap renderer
export const renderEnhancedHeatmap: OverlayRenderer = (context: OverlayRenderContext) => {
  const renderer = new EnhancedHeatmapRenderer();
  return renderer.render(context);
};
