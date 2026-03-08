/**
 * Bookmap-style canvas heatmap renderer
 * True matrix-based heatmap visualization with historical liquidity
 */

import { HeatmapConfig, HeatmapCell, HeatmapFrame, HistoricalLiquidity } from './bookmapHeatmapTypes';

export class BookmapHeatmapRenderer {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private config: HeatmapConfig;
  private priceToYMap: Map<number, number> = new Map();
  
  constructor(config: HeatmapConfig) {
    this.config = config;
  }

  /**
   * Initialize canvas and rendering context
   */
  initializeCanvas(container: HTMLElement): void {
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.config.rendering.dimensions.width;
    this.canvas.height = this.config.rendering.dimensions.height;
    this.canvas.style.position = 'absolute';
    this.canvas.style.top = '0';
    this.canvas.style.left = '0';
    this.canvas.style.pointerEvents = 'none';
    this.canvas.style.zIndex = '1';
    
    container.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d');
    
    if (this.ctx) {
      this.ctx.imageSmoothingEnabled = false; // Crisp pixels for heatmap
    }
  }

  /**
   * Convert price level to Y coordinate on canvas
   */
  private priceToY(price: number, minPrice: number, maxPrice: number): number {
    const priceRange = maxPrice - minPrice;
    const priceOffset = price - minPrice;
    const normalizedY = priceOffset / priceRange;
    
    const padding = this.config.rendering.dimensions.padding;
    const usableHeight = this.canvas!.height - (padding * 2);
    
    return padding + (usableHeight * (1 - normalizedY)); // Invert Y (higher price = lower Y)
  }

  /**
   * Build price to Y coordinate mapping for efficient rendering
   */
  private buildPriceMap(minPrice: number, maxPrice: number, priceStep: number): void {
    this.priceToYMap.clear();
    
    for (let price = minPrice; price <= maxPrice; price += priceStep) {
      this.priceToYMap.set(price, this.priceToY(price, minPrice, maxPrice));
    }
  }

  /**
   * Calculate intensity based on size and age
   */
  private calculateIntensity(size: number, age: number, maxSize: number): number {
    // Size-based intensity (logarithmic scaling)
    let sizeIntensity: number;
    if (this.config.rendering.intensity.scaling === 'logarithmic') {
      const minLog = Math.log10(0.01);
      const maxLog = Math.log10(maxSize);
      sizeIntensity = (Math.log10(Math.max(size, 0.01)) - minLog) / (maxLog - minLog);
    } else {
      sizeIntensity = Math.min(size / maxSize, 1.0);
    }
    
    // Age-based fading
    let ageFactor = 1.0;
    if (age > this.config.history.fadeStartMs) {
      const fadeRange = this.config.history.fadeEndMs - this.config.history.fadeStartMs;
      const fadeProgress = Math.min((age - this.config.history.fadeStartMs) / fadeRange, 1.0);
      ageFactor = 1.0 - fadeProgress;
    }
    
    return Math.max(0, Math.min(1, sizeIntensity * ageFactor));
  }

  /**
   * Convert color with opacity to RGBA string
   */
  private hexToRgba(hex: string, opacity: number): string {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
  }

  /**
   * Render heatmap frame to canvas
   */
  renderFrame(frame: HeatmapFrame): void {
    if (!this.ctx || !this.canvas) return;
    
    // Clear canvas
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    
    // Build price mapping for this frame
    this.buildPriceMap(frame.minPrice, frame.maxPrice, this.config.bucketing.priceStep);
    
    // Calculate cell dimensions
    const padding = this.config.rendering.dimensions.padding;
    const usableWidth = this.canvas.width - (padding * 2);
    const usableHeight = this.canvas.height - (padding * 2);
    const cellHeight = usableHeight / frame.priceLevels.length;
    
    // Render cells
    frame.cells.forEach(cell => {
      const y = this.priceToYMap.get(cell.y) || 0;
      
      // Skip cells outside visible range
      if (y < padding || y > this.canvas.height - padding) return;
      
      // Apply intensity scaling
      const scaledOpacity = this.config.rendering.intensity.minOpacity + 
        (cell.intensity * (this.config.rendering.intensity.maxOpacity - this.config.rendering.intensity.minOpacity));
      
      // Set fill style with color and opacity
      this.ctx.fillStyle = this.hexToRgba(cell.color, scaledOpacity);
      
      // Draw cell as rectangle
      this.ctx.fillRect(
        padding, // X position (full width for heatmap)
        y,      // Y position (price level)
        usableWidth, // Width (full canvas width)
        cellHeight   // Height (price bucket height)
      );
    });
    
    // Draw price level lines (optional, for reference)
    if (this.config.bucketing.priceStep >= 5) { // Only for larger steps
      this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
      this.ctx.lineWidth = 0.5;
      
      frame.priceLevels.forEach(price => {
        const y = this.priceToYMap.get(price);
        if (y) {
          this.ctx.beginPath();
          this.ctx.moveTo(padding, y);
          this.ctx.lineTo(this.canvas.width - padding, y);
          this.ctx.stroke();
        }
      });
    }
  }

  /**
   * Create heatmap cells from historical liquidity data
   */
  createHeatmapFrame(
    historicalLiquidity: HistoricalLiquidity[], 
    currentTimestamp: number
  ): HeatmapFrame {
    if (historicalLiquidity.length === 0) {
      return {
        timestamp: currentTimestamp,
        cells: [],
        priceLevels: [],
        minPrice: 0,
        maxPrice: 0,
        totalBidLiquidity: 0,
        totalAskLiquidity: 0
      };
    }
    
    // Determine price range
    const prices = historicalLiquidity.map(h => h.price);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    
    // Create cells for each price level
    const cells: HeatmapCell[] = [];
    let totalBidLiquidity = 0;
    let totalAskLiquidity = 0;
    let maxSize = 0;
    
    historicalLiquidity.forEach(liquidity => {
      maxSize = Math.max(maxSize, liquidity.maxSize);
      
      // Calculate current intensity from history
      const currentAge = currentTimestamp - liquidity.lastUpdate;
      const intensity = this.calculateIntensity(liquidity.currentSize, currentAge, maxSize);
      
      // Determine dominant side and color
      let side: 'BID' | 'ASK' | 'NEUTRAL';
      let color: string;
      
      const bidSize = Array.from(liquidity.history)
        .filter(h => h.side === 'BID')
        .reduce((sum, h) => sum + h.size, 0);
      
      const askSize = Array.from(liquidity.history)
        .filter(h => h.side === 'ASK')
        .reduce((sum, h) => sum + h.size, 0);
      
      if (bidSize > askSize * 1.2) {
        side = 'BID';
        color = this.config.rendering.colors.bid;
        totalBidLiquidity += liquidity.currentSize;
      } else if (askSize > bidSize * 1.2) {
        side = 'ASK';
        color = this.config.rendering.colors.ask;
        totalAskLiquidity += liquidity.currentSize;
      } else {
        side = 'NEUTRAL';
        color = this.config.rendering.colors.neutral;
      }
      
      cells.push({
        x: 0, // Full width heatmap
        y: liquidity.price,
        width: this.config.rendering.dimensions.width,
        height: this.config.bucketing.priceStep,
        intensity,
        color,
        side,
        age: currentAge
      });
    });
    
    return {
      timestamp: currentTimestamp,
      cells,
      priceLevels: historicalLiquidity.map(h => h.price),
      minPrice,
      maxPrice,
      totalBidLiquidity,
      totalAskLiquidity
    };
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<HeatmapConfig>): void {
    this.config = { ...this.config, ...newConfig };
    
    // Rebuild canvas if dimensions changed
    if (this.canvas && (
      this.canvas.width !== this.config.rendering.dimensions.width ||
      this.canvas.height !== this.config.rendering.dimensions.height
    )) {
      this.canvas.width = this.config.rendering.dimensions.width;
      this.canvas.height = this.config.rendering.dimensions.height;
    }
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    if (this.canvas && this.canvas.parentNode) {
      this.canvas.parentNode.removeChild(this.canvas);
    }
    this.canvas = null;
    this.ctx = null;
    this.priceToYMap.clear();
  }
}
