/**
 * Bookmap-style heatmap canvas component
 * Dedicated canvas-based order book visualization with historical data
 */

import React, { useEffect, useRef, useState } from 'react';
import { BookmapLiquidityManager } from './scanners/bookmapLiquidityManager';
import { BookmapHeatmapRenderer } from './scanners/bookmapHeatmapRenderer';
import { HeatmapConfig, DEFAULT_HEATMAP_CONFIG } from './scanners/bookmapHeatmapTypes';

interface BookmapHeatmapCanvasProps {
  width?: number;
  height?: number;
  enabled?: boolean;
  onConfigChange?: (config: HeatmapConfig) => void;
}

export function BookmapHeatmapCanvas({ 
  width = 800, 
  height = 400, 
  enabled = true,
  onConfigChange 
}: BookmapHeatmapCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<BookmapHeatmapRenderer | null>(null);
  const managerRef = useRef<BookmapLiquidityManager | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  
  const [config, setConfig] = useState<HeatmapConfig>(() => ({
    ...DEFAULT_HEATMAP_CONFIG,
    rendering: {
      ...DEFAULT_HEATMAP_CONFIG.rendering,
      dimensions: {
        ...DEFAULT_HEATMAP_CONFIG.rendering.dimensions,
        width,
        height
      }
    }
  }));

  // Initialize components
  useEffect(() => {
    if (!enabled || !containerRef.current) return;

    // Initialize liquidity manager
    managerRef.current = new BookmapLiquidityManager(config);
    
    // Initialize renderer
    rendererRef.current = new BookmapHeatmapRenderer(config);
    rendererRef.current.initializeCanvas(containerRef.current);
    
    return () => {
      // Cleanup
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      rendererRef.current?.destroy();
      managerRef.current?.clear();
    };
  }, [enabled, width, height]);

  // Update configuration when changed
  useEffect(() => {
    if (managerRef.current) {
      managerRef.current.updateConfig(config);
    }
    if (rendererRef.current) {
      rendererRef.current.updateConfig(config);
    }
    onConfigChange?.(config);
  }, [config, onConfigChange]);

  // Simulate order book data (replace with real data)
  useEffect(() => {
    if (!enabled || !managerRef.current) return;

    const interval = setInterval(() => {
      // Simulate order book updates
      const mockBids: [string, string][] = [
        ['67000', '5.2'],
        ['66990', '3.1'],
        ['66980', '8.7'],
        ['66970', '2.4'],
        ['66960', '12.3']
      ];
      
      const mockAsks: [string, string][] = [
        ['67010', '4.8'],
        ['67020', '6.2'],
        ['67030', '9.1'],
        ['67040', '3.5'],
        ['67050', '7.8']
      ];
      
      managerRef.current.addSnapshot(mockBids, mockAsks, Date.now());
    }, 1000); // Update every second

    return () => clearInterval(interval);
  }, [enabled]);

  // Render loop
  useEffect(() => {
    if (!enabled || !rendererRef.current || !managerRef.current) return;

    const render = () => {
      const historicalLiquidity = managerRef.current.getHistoricalLiquidity();
      const frame = rendererRef.current.createHeatmapFrame(historicalLiquidity, Date.now());
      rendererRef.current.renderFrame(frame);
      
      animationFrameRef.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [enabled]);

  return (
    <div 
      ref={containerRef}
      className="relative w-full h-full"
      style={{ 
        width: `${width}px`, 
        height: `${height}px`,
        display: enabled ? 'block' : 'none'
      }}
    />
  );
}
