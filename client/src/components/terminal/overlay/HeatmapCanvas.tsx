import { useEffect, useRef, useCallback } from "react";
import { HeatmapFrame, HeatmapConfig, calculateLiquidityOpacity, createHeatmapFrame } from "./renderers/heatmap";

export interface GammaContext {
  gammaFlip: number | null;
  gammaMagnets: number[];
}

interface HeatmapCanvasProps {
  isActive: boolean;
  chartWidth: number;
  chartHeight: number;
  priceToCoordinate: (price: number) => number | null;
  currentPrice: number;
  gammaContext?: GammaContext | null;
}

const DEFAULT_CONFIG: HeatmapConfig = {
  maxFrames: 30, // 30 frames for ~30 seconds of history at 1fps
  opacityDecay: 0.9, // Slower decay for better persistence
  sizeThresholds: {
    small: 0.1,
    medium: 0.3,
    large: 0.6
  }
};

export function HeatmapCanvas({ 
  isActive, 
  chartWidth, 
  chartHeight, 
  priceToCoordinate,
  currentPrice,
  gammaContext = null,
}: HeatmapCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameHistoryRef = useRef<HeatmapFrame[]>([]);
  const animationFrameRef = useRef<number | null>(null);
  const configRef = useRef<HeatmapConfig>(DEFAULT_CONFIG);
  const gammaContextRef = useRef<GammaContext | null>(gammaContext);
  gammaContextRef.current = gammaContext ?? null;

  // Add frame to history
  const addFrame = useCallback((frame: HeatmapFrame) => {
    const history = frameHistoryRef.current;
    history.push(frame);
    
    // Keep only the most recent frames
    if (history.length > configRef.current.maxFrames) {
      history.shift();
    }
  }, []);

  // Render heatmap frames
  const renderHeatmap = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!isActive || frameHistoryRef.current.length === 0) return;

    const frames = frameHistoryRef.current;
    const config = configRef.current;
    
    // Calculate max size across all frames for normalization
    let maxSize = 0;
    frames.forEach(frame => {
      frame.bids.forEach((level: { price: number; size: number }) => {
        if (level.size > maxSize) maxSize = level.size;
      });
      frame.asks.forEach((level: { price: number; size: number }) => {
        if (level.size > maxSize) maxSize = level.size;
      });
    });

    if (maxSize <= 0) return;

    const gamma = gammaContextRef.current;
    const gammaDecay = currentPrice > 0 ? currentPrice * 0.01 : 1000;
    const GAMMA_FLIP_WEIGHT = 0.65;
    const gammaInfluence = (price: number): number => {
      if (!gamma || (!gamma.gammaFlip && (!gamma.gammaMagnets || gamma.gammaMagnets.length === 0))) return 1;
      let magnetInfluence = 0;
      let flipInfluence = 0;
      if (gamma.gammaMagnets?.length) {
        const distMagnet = Math.min(...gamma.gammaMagnets.map((p) => Math.abs(price - p)));
        magnetInfluence = Math.exp(-distMagnet / gammaDecay);
      }
      if (gamma.gammaFlip != null) {
        const distFlip = Math.abs(price - gamma.gammaFlip);
        flipInfluence = Math.exp(-distFlip / gammaDecay) * GAMMA_FLIP_WEIGHT;
      }
      return Math.max(magnetInfluence, flipInfluence) || 1;
    };
    // DEBUG: strong boost to visibly separate gamma-influenced levels from normal
    const gammaBoost = (influence: number): number => {
      if (influence <= 0.05) return 1;
      return Math.min(1.6, 0.4 + 1.2 * Math.pow(Math.min(1, influence), 0.5));
    };

    console.debug('[Heatmap Canvas] Real rendering stats:', {
      framesCount: frames.length,
      bidLevels: frames[frames.length - 1]?.bids.length || 0,
      askLevels: frames[frames.length - 1]?.asks.length || 0,
      maxSize: maxSize.toFixed(4),
      canvasSize: `${canvas.width}x${canvas.height}`
    });

    let totalRectanglesDrawn = 0;
    let visibleBidLevels = 0;
    let visibleAskLevels = 0;

    // Render each frame with age-based opacity decay
    frames.forEach((frame, frameIndex) => {
      const ageOpacity = Math.pow(config.opacityDecay, frames.length - 1 - frameIndex);
      const frameWidth = canvas.width / frames.length;
      const xOffset = frameIndex * frameWidth;

      // Render bids (green); brighter near gamma magnets/flip (non-linear boost)
      frame.bids.forEach((level: { price: number; size: number }) => {
        const y = priceToCoordinate(level.price);
        if (y === null) return;

        const intensity = maxSize > 0 ? level.size / maxSize : 0;
        let opacity = 0.18 + intensity * 0.55;
        const influence = gammaInfluence(level.price);
        opacity = Math.min(0.98, opacity * gammaBoost(influence));
        const finalOpacity = opacity * ageOpacity;

        ctx.fillStyle = `rgba(34, 197, 94, ${finalOpacity})`;
        ctx.fillRect(xOffset, y, frameWidth, 6); // 6px height for visibility
        totalRectanglesDrawn++;
        visibleBidLevels++;
      });

      // Render asks (red); brighter near gamma magnets/flip (non-linear boost)
      frame.asks.forEach((level: { price: number; size: number }) => {
        const y = priceToCoordinate(level.price);
        if (y === null) return;

        const intensity = maxSize > 0 ? level.size / maxSize : 0;
        let opacity = 0.18 + intensity * 0.55;
        const influence = gammaInfluence(level.price);
        opacity = Math.min(0.98, opacity * gammaBoost(influence));
        const finalOpacity = opacity * ageOpacity;

        ctx.fillStyle = `rgba(239, 68, 68, ${finalOpacity})`;
        ctx.fillRect(xOffset, y, frameWidth, 6); // 6px height for visibility
        totalRectanglesDrawn++;
        visibleAskLevels++;
      });
    });

    console.debug('[Heatmap Canvas] Final render stats:', {
      totalRectanglesDrawn,
      visibleBidLevels,
      visibleAskLevels,
      maxFrames: config.maxFrames
    });
  }, [isActive, priceToCoordinate, currentPrice]);

  // Animation loop
  const animate = useCallback(() => {
    renderHeatmap();
    animationFrameRef.current = requestAnimationFrame(animate);
  }, [renderHeatmap]);

  // Setup canvas and animation
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      console.error('[Heatmap Canvas] Canvas ref is null!');
      return;
    }

    console.debug('[Heatmap Canvas] Canvas mounted:', {
      element: canvas.tagName,
      width: chartWidth,
      height: chartHeight,
      parentElement: canvas.parentElement?.tagName,
      zIndex: window.getComputedStyle(canvas).zIndex,
      position: window.getComputedStyle(canvas).position,
      pointerEvents: window.getComputedStyle(canvas).pointerEvents
    });

    // Set canvas size
    canvas.width = chartWidth;
    canvas.height = chartHeight;

    // Start animation loop
    animate();

    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [chartWidth, chartHeight, animate]);

  // Handle resize
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.width = chartWidth;
      canvas.height = chartHeight;
    }
  }, [chartWidth, chartHeight]);

  // Expose methods for external updates
  useEffect(() => {
    // This will be called by parent component to update frames
    (window as any).heatmapCanvas = {
      addFrame: (timestamp: number, filteredBids: { price: number; size: number }[], filteredAsks: { price: number; size: number }[]) => {
        const frame = createHeatmapFrame(filteredBids, filteredAsks, timestamp);
        addFrame(frame);
      },
      clearHistory: () => {
        frameHistoryRef.current = [];
      }
    };

    return () => {
      delete (window as any).heatmapCanvas;
    };
  }, [addFrame]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 pointer-events-none"
      style={{ zIndex: 5 }}
    />
  );
}
