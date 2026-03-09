// Define missing types locally since they're not in shared schema
interface OrderBookLevel {
  price: number;
  size: number;
}

interface LiquidityHeatZone {
  priceStart: number;
  priceEnd: number;
  intensity: number;
}

interface HeatmapSummary {
  bidPressure: number;
  askPressure: number;
  netPressure: number;
}

// Configuration constants
const PRICE_BAND_SIZE = 0.001; // 0.1% bands
const MIN_BANDS_FOR_ANALYSIS = 20;
const THIN_LIQUIDITY_THRESHOLD = 0.3; // 30% of local average
const EMPTY_BAND_THRESHOLD = 0.01; // 1% of local average
const MIN_CONSECUTIVE_THIN_BANDS = 3;
const VACUUM_PROXIMITY_THRESHOLD = 0.005; // 0.5% from spot
const IMMEDIATE_PROXIMITY_THRESHOLD = 0.002; // 0.2% from spot

// Component weights for vacuum score calculation
const VACUUM_WEIGHTS = {
  gap: 0.25,
  density: 0.30,
  imbalance: 0.15,
  proximity: 0.15,
  acceleration: 0.15
};

// Risk classification thresholds
const RISK_THRESHOLDS = {
  LOW: 24,
  MEDIUM: 49,
  HIGH: 74,
  EXTREME: 100
};

// Liquidity band structure
interface LiquidityBand {
  startPrice: number;
  endPrice: number;
  midPrice: number;
  bidSize: number;
  askSize: number;
  totalSize: number;
  density: number;
  isThin: boolean;
  isEmpty: boolean;
  direction: "ABOVE" | "BELOW" | "AT_SPOT" | "NONE";
}

// Vacuum zone structure
interface VacuumZone {
  start: number;
  end: number;
  direction: "UP" | "DOWN";
  score: number;
  thickness: "THIN" | "VERY_THIN" | "EMPTY";
  targetCluster: number | null;
  travelEfficiency: number;
  bandCount: number;
}

// Component scores for debugging
interface ComponentScores {
  gapScore: number;
  densityScore: number;
  imbalanceScore: number;
  proximityScore: number;
  accelerationScore: number;
}

// Main vacuum engine output
export interface VacuumAnalysisResult {
  vacuumRisk: "LOW" | "MEDIUM" | "HIGH" | "EXTREME";
  vacuumScore: number;
  vacuumType: "DIRECTIONAL" | "COMPRESSION" | "NONE";
  vacuumDirection: "UP" | "DOWN" | "NEUTRAL";
  vacuumProximity: "FAR" | "MEDIUM" | "NEAR" | "IMMEDIATE";
  nearestThinLiquidityZone: number | null;
  nearestThinLiquidityDirection: "ABOVE" | "BELOW" | "NONE";
  nearestThinLiquidityScore: number;
  confirmedVacuumActive: boolean;
  activeZones: VacuumZone[];
  explanation: {
    summary: string[];
    drivers: string[];
    invalidation: string[];
  };
  debug?: {
    bandMetrics: LiquidityBand[];
    lowDensityBands: LiquidityBand[];
    clusterMap: Map<string, number[]>;
    componentScores: ComponentScores;
  };
}

// Input data structure
export interface VacuumEngineInput {
  spotPrice: number;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  heatmapSummary?: HeatmapSummary;
  liquidityHeatZones?: LiquidityHeatZone[];
  nearestBookClusters?: { above: number[]; below: number[] };
  spread?: number;
  liquiditySweepRisk?: { risk: string; direction: string; confidence: number };
  dealerHedgingFlow?: { direction: string; intensity: number };
  volatility?: number;
}

export class LiquidityVacuumEngine {
  private config = {
    priceBandSize: PRICE_BAND_SIZE,
    minBandsForAnalysis: MIN_BANDS_FOR_ANALYSIS,
    thinLiquidityThreshold: THIN_LIQUIDITY_THRESHOLD,
    emptyBandThreshold: EMPTY_BAND_THRESHOLD,
    minConsecutiveThinBands: MIN_CONSECUTIVE_THIN_BANDS,
    vacuumProximityThreshold: VACUUM_PROXIMITY_THRESHOLD,
    immediateProximityThreshold: IMMEDIATE_PROXIMITY_THRESHOLD
  };

  private weights = VACUUM_WEIGHTS;
  private riskThresholds = RISK_THRESHOLDS;

  /**
   * Main analysis entry point
   */
  analyze(input: VacuumEngineInput): VacuumAnalysisResult {
    console.log("=== VACUUM ENGINE DEBUG: ANALYSIS START ===");
    console.log("RAW INPUTS:", {
      spotPrice: input.spotPrice,
      bidsCount: input.bids?.length || 0,
      asksCount: input.asks?.length || 0,
      spread: input.spread,
      hasSweepRisk: !!input.liquiditySweepRisk,
      hasDealerFlow: !!input.dealerHedgingFlow,
      sweepDirection: input.liquiditySweepRisk?.direction,
      dealerDirection: input.dealerHedgingFlow?.direction
    });

    // Validate input data quality
    if (!this.validateInput(input)) {
      console.log("INPUT VALIDATION: FAILED - returning low quality result");
      return this.createLowQualityResult();
    }

    console.log("INPUT VALIDATION: PASSED");

    // Create liquidity bands
    const bands = this.createLiquidityBands(input);
    console.log("LIQUIDITY BANDS:", {
      totalBands: bands.length,
      thinBands: bands.filter(b => b.isThin).length,
      emptyBands: bands.filter(b => b.isEmpty).length,
      avgDensity: bands.reduce((sum, b) => sum + b.density, 0) / bands.length
    });
    
    // Identify thin liquidity regions
    const thinRegions = this.identifyThinLiquidityRegions(bands);
    console.log("THIN REGIONS:", {
      count: thinRegions.length,
      regions: thinRegions.map(r => ({
        direction: r.direction,
        start: r.startPrice,
        end: r.endPrice,
        totalSize: r.totalSize,
        isEmpty: r.isEmpty
      }))
    });
    
    // Calculate component scores
    const componentScores = this.calculateComponentScores(input, bands, thinRegions);
    console.log("COMPONENT SCORES:", componentScores);
    
    // Compute overall vacuum score
    const vacuumScore = this.computeVacuumScore(componentScores);
    console.log("OVERALL VACUUM SCORE:", vacuumScore);
    
    // Determine risk classification
    const vacuumRisk = this.classifyRisk(vacuumScore);
    console.log("RISK CLASSIFICATION:", vacuumRisk);
    
    // Analyze directional bias
    const vacuumDirection = this.analyzeDirection(input, bands, thinRegions, componentScores, vacuumScore);
    console.log("DIRECTIONAL ANALYSIS:", vacuumDirection);
    
    // Classify vacuum type
    const vacuumType = this.classifyVacuumType(thinRegions, vacuumScore, vacuumDirection, componentScores);
    console.log("VACUUM TYPE CLASSIFICATION:", vacuumType);
    
    // SAFETY RULE: Force NEUTRAL direction for COMPRESSION vacuums
    let finalDirection = vacuumDirection;
    if (vacuumType === "COMPRESSION") {
      finalDirection = "NEUTRAL";
      console.log("SAFETY RULE APPLIED: COMPRESSION vacuum forced to NEUTRAL direction");
    }
    
    // Determine proximity
    const vacuumProximity = this.determineProximity(input.spotPrice, thinRegions);
    console.log("PROXIMITY ANALYSIS:", vacuumProximity);
    
    // Identify nearest thin zone
    const nearestZone = this.findNearestThinZone(input.spotPrice, thinRegions);
    console.log("NEAREST THIN ZONE:", nearestZone);
    
    // Create active vacuum zones
    const activeZones = this.createActiveZones(thinRegions, input.spotPrice);
    console.log("ACTIVE ZONES:", {
      count: activeZones.length,
      zones: activeZones.map(z => ({
        direction: z.direction,
        start: z.start,
        end: z.end,
        score: z.score,
        thickness: z.thickness
      }))
    });
    
    // Determine if vacuum is confirmed active
    const confirmedVacuumActive = this.isVacuumConfirmed(
      vacuumScore, vacuumProximity, vacuumDirection, thinRegions
    );
    console.log("CONFIRMED VACUUM ACTIVE:", confirmedVacuumActive);
    
    // Generate explanations
    const explanation = this.generateExplanations(
      input, componentScores, thinRegions, finalDirection, confirmedVacuumActive, vacuumScore
    );
    console.log("EXPLANATIONS:", explanation);

    // CONTRADICTION DETECTION
    this.detectContradictions({
      vacuumRisk,
      vacuumScore,
      vacuumType,
      vacuumDirection: finalDirection,
      vacuumProximity,
      confirmedVacuumActive,
      activeZones,
      componentScores,
      explanation
    });

    const result: VacuumAnalysisResult = {
      vacuumRisk,
      vacuumScore,
      vacuumType,
      vacuumDirection: finalDirection,
      vacuumProximity,
      nearestThinLiquidityZone: nearestZone?.price || null,
      nearestThinLiquidityDirection: nearestZone?.direction || "NONE",
      nearestThinLiquidityScore: nearestZone?.score || 0,
      confirmedVacuumActive,
      activeZones,
      explanation
    };

    // Add debug data in development mode
    if (process.env.NODE_ENV === "development") {
      result.debug = {
        bandMetrics: bands,
        lowDensityBands: thinRegions,
        clusterMap: this.buildClusterMap(input),
        componentScores
      };
    }

    console.log("=== VACUUM ENGINE DEBUG: ANALYSIS COMPLETE ===");
    return result;
  }

  /**
   * Detect logical contradictions in the analysis
   */
  private detectContradictions(analysis: {
    vacuumRisk: string;
    vacuumScore: number;
    vacuumType: string;
    vacuumDirection: string;
    vacuumProximity: string;
    confirmedVacuumActive: boolean;
    activeZones: any[];
    componentScores: ComponentScores;
    explanation: any;
  }): void {
    const contradictions: string[] = [];

    // HIGH risk with no usable active zone
    if (analysis.vacuumRisk === "HIGH" && analysis.activeZones.length === 0) {
      contradictions.push("HIGH risk with zero active zones");
    }

    // DOWN direction while bid-side structure is stronger
    if (analysis.vacuumDirection === "DOWN" && analysis.componentScores.imbalanceScore > 60) {
      const bidTotal = analysis.componentScores.imbalanceScore; // This needs actual bid/ask data
      if (bidTotal > 60) {
        contradictions.push("DOWN direction with strong bid-side structure");
      }
    }

    // confirmedVacuumActive true with FAR proximity
    if (analysis.confirmedVacuumActive && analysis.vacuumProximity === "FAR") {
      contradictions.push("Confirmed vacuum active with FAR proximity");
    }

    // zero activeZones but non-trivial vacuumScore
    if (analysis.activeZones.length === 0 && analysis.vacuumScore >= 30) {
      contradictions.push(`Zero active zones but vacuumScore is ${analysis.vacuumScore}`);
    }

    // explanation text not matching numeric output
    const hasHighRiskExplanation = analysis.explanation.summary.some((s: string) => 
      s.toLowerCase().includes("extreme") || s.toLowerCase().includes("significant")
    );
    if (analysis.vacuumScore >= 50 && !hasHighRiskExplanation) {
      contradictions.push("High vacuum score but no corresponding explanation");
    }

    // NEW: COMPRESSION vacuum with non-NEUTRAL direction
    if (analysis.vacuumType === "COMPRESSION" && analysis.vacuumDirection !== "NEUTRAL") {
      contradictions.push("COMPRESSION vacuum type with non-NEUTRAL direction");
    }

    // NEW: DIRECTIONAL vacuum with NEUTRAL direction
    if (analysis.vacuumType === "DIRECTIONAL" && analysis.vacuumDirection === "NEUTRAL") {
      contradictions.push("DIRECTIONAL vacuum type with NEUTRAL direction");
    }

    // NEW: NONE vacuum type with high score
    if (analysis.vacuumType === "NONE" && analysis.vacuumScore >= 50) {
      contradictions.push("NONE vacuum type with high vacuum score");
    }

    if (contradictions.length > 0) {
      console.error("VACUUM ENGINE CONTRADICTIONS DETECTED:", contradictions);
    } else {
      console.log("VACUUM ENGINE: No contradictions detected");
    }
  }

  /**
   * Validate input data quality
   */
  private validateInput(input: VacuumEngineInput): boolean {
    if (!input.spotPrice || !Array.isArray(input.bids) || !Array.isArray(input.asks)) {
      return false;
    }

    if (input.bids.length < 5 || input.asks.length < 5) {
      return false;
    }

    // Check for crossed book
    const bestBid = input.bids[0]?.price || 0;
    const bestAsk = input.asks[0]?.price || 0;
    
    if (bestBid >= bestAsk) {
      return false;
    }

    return true;
  }

  /**
   * Create liquidity bands from orderbook data
   */
  private createLiquidityBands(input: VacuumEngineInput): LiquidityBand[] {
    const bands: LiquidityBand[] = [];
    const { spotPrice, bids, asks } = input;

    // Calculate analysis range (±2% from spot)
    const range = spotPrice * 0.02;
    const minPrice = spotPrice - range;
    const maxPrice = spotPrice + range;

    // Create bands
    for (let price = minPrice; price <= maxPrice; price += spotPrice * this.config.priceBandSize) {
      const bandStart = price;
      const bandEnd = price + spotPrice * this.config.priceBandSize;
      const bandMid = (bandStart + bandEnd) / 2;

      // Aggregate liquidity within band
      const bidSize = bids
        .filter(bid => bid.price >= bandStart && bid.price < bandEnd)
        .reduce((sum, bid) => sum + bid.size, 0);

      const askSize = asks
        .filter(ask => ask.price >= bandStart && ask.price < bandEnd)
        .reduce((sum, ask) => sum + ask.size, 0);

      const totalSize = bidSize + askSize;

      // Determine direction relative to spot
      let direction: "ABOVE" | "BELOW" | "AT_SPOT";
      if (bandEnd <= spotPrice) {
        direction = "BELOW";
      } else if (bandStart >= spotPrice) {
        direction = "ABOVE";
      } else {
        direction = "AT_SPOT";
      }

      bands.push({
        startPrice: bandStart,
        endPrice: bandEnd,
        midPrice: bandMid,
        bidSize,
        askSize,
        totalSize,
        density: totalSize / (bandEnd - bandStart),
        isThin: false, // Will be calculated later
        isEmpty: totalSize < this.config.emptyBandThreshold,
        direction
      });
    }

    // Calculate local averages and identify thin bands
    this.identifyThinBands(bands);

    return bands;
  }

  /**
   * Identify thin liquidity bands based on local averages
   */
  private identifyThinBands(bands: LiquidityBand[]): void {
    const windowSize = 5; // Local average window

    bands.forEach((band, index) => {
      // Calculate local average density
      const startIdx = Math.max(0, index - windowSize);
      const endIdx = Math.min(bands.length - 1, index + windowSize);
      
      let localSum = 0;
      let localCount = 0;
      
      for (let i = startIdx; i <= endIdx; i++) {
        localSum += bands[i].totalSize;
        localCount++;
      }
      
      const localAverage = localSum / localCount;
      const threshold = localAverage * this.config.thinLiquidityThreshold;
      
      band.isThin = band.totalSize < threshold && !band.isEmpty;
    });
  }

  /**
   * Identify contiguous thin liquidity regions
   */
  private identifyThinLiquidityRegions(bands: LiquidityBand[]): LiquidityBand[] {
    const thinBands = bands.filter(band => band.isThin || band.isEmpty);
    const regions: LiquidityBand[] = [];

    // Find contiguous thin regions
    let currentRegion: LiquidityBand[] = [];
    
    for (const band of thinBands) {
      if (currentRegion.length === 0) {
        currentRegion.push(band);
      } else {
        const lastBand = currentRegion[currentRegion.length - 1];
        // Check if bands are contiguous
        if (Math.abs(band.midPrice - lastBand.midPrice) <= (band.endPrice - band.startPrice) * 1.5) {
          currentRegion.push(band);
        } else {
          // Save current region if it meets minimum length
          if (currentRegion.length >= this.config.minConsecutiveThinBands) {
            regions.push(...currentRegion);
          }
          currentRegion = [band];
        }
      }
    }
    
    // Save final region
    if (currentRegion.length >= this.config.minConsecutiveThinBands) {
      regions.push(...currentRegion);
    }

    return regions;
  }

  /**
   * Calculate component scores for vacuum analysis
   */
  private calculateComponentScores(
    input: VacuumEngineInput,
    bands: LiquidityBand[],
    thinRegions: LiquidityBand[]
  ): ComponentScores {
    // Gap score - size of liquidity gaps
    const gapScore = this.calculateGapScore(thinRegions);
    
    // Density score - thinness of passive liquidity
    const densityScore = this.calculateDensityScore(thinRegions, bands);
    
    // Imbalance score - orderbook imbalance
    const imbalanceScore = this.calculateImbalanceScore(input);
    
    // Proximity score - closeness to spot
    const proximityScore = this.calculateProximityScore(input.spotPrice, thinRegions);
    
    // Acceleration score - alignment with other indicators
    const accelerationScore = this.calculateAccelerationScore(input);

    return {
      gapScore,
      densityScore,
      imbalanceScore,
      proximityScore,
      accelerationScore
    };
  }

  /**
   * Calculate gap score based on size of thin regions
   */
  private calculateGapScore(thinRegions: LiquidityBand[]): number {
    if (thinRegions.length === 0) return 0;

    // Find the largest contiguous thin region
    let maxGapSize = 0;
    let currentGapSize = 0;

    for (const region of thinRegions) {
      const regionWidth = region.endPrice - region.startPrice;
      currentGapSize += regionWidth;
      maxGapSize = Math.max(maxGapSize, currentGapSize);
    }

    // Normalize to 0-100 scale (0.5% gap = 100 points)
    const normalizedGap = Math.min(100, (maxGapSize / 0.005) * 100);
    return Math.round(normalizedGap);
  }

  /**
   * Calculate density score based on thinness of liquidity
   */
  private calculateDensityScore(thinRegions: LiquidityBand[], bands: LiquidityBand[]): number {
    if (thinRegions.length === 0) return 0;

    // Calculate average thinness
    const totalThinness = thinRegions.reduce((sum, band) => {
      const localAverage = this.getLocalAverageDensity(bands, band);
      const thinnessRatio = localAverage > 0 ? band.totalSize / localAverage : 0;
      return sum + (1 - thinnessRatio); // Invert - lower density = higher score
    }, 0);

    const averageThinness = totalThinness / thinRegions.length;
    return Math.min(100, Math.round(averageThinness * 100));
  }

  /**
   * Calculate imbalance score from orderbook
   */
  private calculateImbalanceScore(input: VacuumEngineInput): number {
    const { bids, asks } = input;
    
    // Calculate total size on each side
    const totalBidSize = bids.reduce((sum, bid) => sum + bid.size, 0);
    const totalAskSize = asks.reduce((sum, ask) => sum + ask.size, 0);
    
    const totalSize = totalBidSize + totalAskSize;
    if (totalSize === 0) return 0;

    // Calculate imbalance ratio (0-1)
    const bidRatio = totalBidSize / totalSize;
    const imbalance = Math.abs(bidRatio - 0.5) * 2; // 0 = balanced, 1 = completely imbalanced

    return Math.round(imbalance * 100);
  }

  /**
   * Calculate proximity score based on distance from spot
   */
  private calculateProximityScore(spotPrice: number, thinRegions: LiquidityBand[]): number {
    if (thinRegions.length === 0) return 0;

    // Find closest thin region to spot
    let minDistance = Infinity;
    
    for (const region of thinRegions) {
      const distance = Math.min(
        Math.abs(region.startPrice - spotPrice),
        Math.abs(region.endPrice - spotPrice),
        Math.abs(region.midPrice - spotPrice)
      );
      minDistance = Math.min(minDistance, distance);
    }

    // Convert distance to proximity score (closer = higher score)
    const proximityRatio = minDistance / spotPrice;
    const proximityScore = Math.max(0, 100 - (proximityRatio / 0.01) * 100); // 1% = 0 points
    
    return Math.round(proximityScore);
  }

  /**
   * Calculate acceleration score from confluence indicators
   */
  private calculateAccelerationScore(input: VacuumEngineInput): number {
    let score = 0;

    // Liquidity sweep detector alignment
    if (input.liquiditySweepRisk) {
      const sweepConfidence = input.liquiditySweepRisk.confidence || 0;
      score += sweepConfidence * 40; // Max 40 points from sweep
    }

    // Dealer hedging flow alignment
    if (input.dealerHedgingFlow) {
      const flowIntensity = input.dealerHedgingFlow.intensity || 0;
      score += flowIntensity * 30; // Max 30 points from flow
    }

    // Volatility expansion
    if (input.volatility && input.volatility > 0.02) { // 2%+ volatility
      score += 20; // Fixed 20 points for high volatility
    }

    // Heatmap confluence
    if (input.heatmapSummary) {
      // Add points if heatmap shows directional bias
      score += 10; // Fixed 10 points for heatmap confluence
    }

    return Math.min(100, Math.round(score));
  }

  /**
   * Compute overall vacuum score from components
   */
  private computeVacuumScore(scores: ComponentScores): number {
    const weightedScore = 
      scores.gapScore * this.weights.gap +
      scores.densityScore * this.weights.density +
      scores.imbalanceScore * this.weights.imbalance +
      scores.proximityScore * this.weights.proximity +
      scores.accelerationScore * this.weights.acceleration;

    return Math.min(100, Math.round(weightedScore));
  }

  /**
   * Classify risk based on vacuum score
   */
  private classifyRisk(score: number): "LOW" | "MEDIUM" | "HIGH" | "EXTREME" {
    if (score <= this.riskThresholds.LOW) return "LOW";
    if (score <= this.riskThresholds.MEDIUM) return "MEDIUM";
    if (score <= this.riskThresholds.HIGH) return "HIGH";
    return "EXTREME";
  }

  /**
   * Classify vacuum type based on liquidity distribution
   */
  private classifyVacuumType(
    thinRegions: LiquidityBand[],
    vacuumScore: number,
    vacuumDirection: "UP" | "DOWN" | "NEUTRAL",
    componentScores: ComponentScores
  ): "DIRECTIONAL" | "COMPRESSION" | "NONE" {
    // No meaningful vacuum if score is too low
    if (vacuumScore < 50 || thinRegions.length === 0) {
      return "NONE";
    }

    // Count thin regions above and below spot
    const thinAbove = thinRegions.filter(r => r.direction === "ABOVE").length;
    const thinBelow = thinRegions.filter(r => r.direction === "BELOW").length;

    // Compression vacuum: thin liquidity on both sides
    if (thinAbove > 0 && thinBelow > 0) {
      // Check if pressure is balanced (compression setup)
      const imbalanceStrength = componentScores.imbalanceScore;
      if (imbalanceStrength < 60) { // Balanced or weak imbalance
        return "COMPRESSION";
      }
    }

    // Directional vacuum: thin liquidity primarily on one side
    if ((thinAbove > 0 && thinBelow === 0) || (thinBelow > 0 && thinAbove === 0)) {
      // Verify directional bias matches thin liquidity location
      const directionalSide = thinAbove > 0 ? "UP" : "DOWN";
      if (vacuumDirection === directionalSide) {
        return "DIRECTIONAL";
      }
    }

    // Default to NONE if conditions don't clearly match
    return "NONE";
  }

  /**
   * Analyze directional bias
   */
  private analyzeDirection(
    input: VacuumEngineInput,
    bands: LiquidityBand[],
    thinRegions: LiquidityBand[],
    scores: ComponentScores,
    overallScore: number
  ): "UP" | "DOWN" | "NEUTRAL" {
    // Count thin regions above and below spot
    const thinAbove = thinRegions.filter(r => r.direction === "ABOVE").length;
    const thinBelow = thinRegions.filter(r => r.direction === "BELOW").length;

    // Calculate imbalance direction
    const { bids, asks } = input;
    const totalBidSize = bids.reduce((sum, bid) => sum + bid.size, 0);
    const totalAskSize = asks.reduce((sum, ask) => sum + ask.size, 0);
    const imbalanceDirection = totalBidSize > totalAskSize ? "DOWN" : "UP";

    // Check confluence indicators
    let confluenceUp = 0;
    let confluenceDown = 0;

    if (input.liquiditySweepRisk?.direction === "UP") confluenceUp += 1;
    if (input.liquiditySweepRisk?.direction === "DOWN") confluenceDown += 1;

    if (input.dealerHedgingFlow?.direction === "BUY") confluenceUp += 1;
    if (input.dealerHedgingFlow?.direction === "SELL") confluenceDown += 1;

    // Calculate directional scores
    const upScore = thinAbove * 2 + (imbalanceDirection === "UP" ? 1 : 0) + confluenceUp;
    const downScore = thinBelow * 2 + (imbalanceDirection === "DOWN" ? 1 : 0) + confluenceDown;

    // Determine direction with confidence threshold
    const confidence = Math.abs(upScore - downScore) / Math.max(upScore + downScore, 1);
    
    if (confidence < 0.3 || overallScore < 30) {
      return "NEUTRAL";
    }

    return upScore > downScore ? "UP" : "DOWN";
  }

  /**
   * Determine proximity classification
   */
  private determineProximity(spotPrice: number, thinRegions: LiquidityBand[]): "FAR" | "MEDIUM" | "NEAR" | "IMMEDIATE" {
    if (thinRegions.length === 0) return "FAR";

    // Find closest thin region
    let minDistance = Infinity;
    for (const region of thinRegions) {
      const distance = Math.min(
        Math.abs(region.startPrice - spotPrice),
        Math.abs(region.endPrice - spotPrice)
      );
      minDistance = Math.min(minDistance, distance);
    }

    const distanceRatio = minDistance / spotPrice;

    if (distanceRatio <= this.config.immediateProximityThreshold) return "IMMEDIATE";
    if (distanceRatio <= this.config.vacuumProximityThreshold) return "NEAR";
    if (distanceRatio <= 0.01) return "MEDIUM"; // 1%
    return "FAR";
  }

  /**
   * Find nearest thin liquidity zone
   */
  private findNearestThinZone(spotPrice: number, thinRegions: LiquidityBand[]): { price: number; direction: "ABOVE" | "BELOW"; score: number } | null {
    if (thinRegions.length === 0) return null;

    let nearest: { price: number; direction: "ABOVE" | "BELOW"; score: number; distance: number } | null = null;

    for (const region of thinRegions) {
      const distance = Math.min(
        Math.abs(region.startPrice - spotPrice),
        Math.abs(region.endPrice - spotPrice)
      );

      if (!nearest || distance < nearest.distance) {
        // Map band direction to return direction
        const returnDirection: "ABOVE" | "BELOW" = 
          region.direction === "ABOVE" ? "ABOVE" : 
          region.direction === "BELOW" ? "BELOW" : 
          region.midPrice > spotPrice ? "ABOVE" : "BELOW";

        nearest = {
          price: region.midPrice,
          direction: returnDirection,
          score: region.isEmpty ? 100 : 75, // Empty zones get higher score
          distance
        };
      }
    }

    return nearest;
  }

  /**
   * Create active vacuum zones
   */
  private createActiveZones(thinRegions: LiquidityBand[], spotPrice: number): VacuumZone[] {
    const zones: VacuumZone[] = [];
    
    // Group contiguous bands into zones
    const zoneGroups = this.groupContiguousBands(thinRegions);
    
    for (const group of zoneGroups) {
      const start = Math.min(...group.map(b => b.startPrice));
      const end = Math.max(...group.map(b => b.endPrice));
      const direction = group[0].direction === "ABOVE" ? "UP" : "DOWN";
      
      // Calculate zone score
      const avgDensity = group.reduce((sum, b) => sum + b.totalSize, 0) / group.length;
      const thickness = avgDensity < this.config.emptyBandThreshold ? "EMPTY" : 
                       avgDensity < this.config.thinLiquidityThreshold ? "VERY_THIN" : "THIN";
      
      // Find target cluster
      const targetCluster = this.findTargetCluster(group, spotPrice);
      
      // Calculate travel efficiency
      const travelEfficiency = this.calculateTravelEfficiency(group, targetCluster);

      zones.push({
        start,
        end,
        direction,
        score: Math.min(100, Math.round((1 - avgDensity) * 100)),
        thickness,
        targetCluster,
        travelEfficiency,
        bandCount: group.length
      });
    }

    return zones.sort((a, b) => b.score - a.score).slice(0, 3); // Top 3 zones
  }

  /**
   * Determine if vacuum is confirmed active
   */
  private isVacuumConfirmed(
    score: number,
    proximity: "FAR" | "MEDIUM" | "NEAR" | "IMMEDIATE",
    direction: "UP" | "DOWN" | "NEUTRAL",
    thinRegions: LiquidityBand[]
  ): boolean {
    // Must have sufficient score
    if (score < 50) return false;
    
    // Must be near or immediate
    if (proximity !== "NEAR" && proximity !== "IMMEDIATE") return false;
    
    // Must have clear direction
    if (direction === "NEUTRAL") return false;
    
    // Must have thin regions
    if (thinRegions.length === 0) return false;

    return true;
  }

  /**
   * Generate explanations for the analysis
   */
  private generateExplanations(
    input: VacuumEngineInput,
    scores: ComponentScores,
    thinRegions: LiquidityBand[],
    direction: "UP" | "DOWN" | "NEUTRAL",
    confirmed: boolean,
    overallScore: number
  ): { summary: string[]; drivers: string[]; invalidation: string[] } {
    const summary: string[] = [];
    const drivers: string[] = [];
    const invalidation: string[] = [];

    // Calculate vacuum type for explanation
    const vacuumType = this.classifyVacuumType(thinRegions, overallScore, direction, scores);

    // Summary explanations based on vacuum type
    if (vacuumType === "DIRECTIONAL") {
      summary.push("Thin liquidity below spot creates a directional vacuum");
    } else if (vacuumType === "COMPRESSION") {
      summary.push("Two-sided thin liquidity forms a volatility compression pocket");
    } else {
      summary.push("No meaningful vacuum detected in the current orderbook structure");
    }

    // Risk level explanations
    if (overallScore >= 75) {
      summary.push("Extreme liquidity vacuum detected with high acceleration potential");
    } else if (overallScore >= 50) {
      summary.push("Significant thin liquidity zone creates directional bias");
    } else if (overallScore >= 25) {
      summary.push("Moderate liquidity weakness identified");
    } else {
      summary.push("Liquidity distribution appears balanced");
    }

    // Driver explanations
    if (scores.gapScore >= 60) {
      drivers.push("Large liquidity gap creates path of least resistance");
    }
    if (scores.densityScore >= 60) {
      drivers.push("Passive liquidity density significantly below average");
    }
    if (scores.imbalanceScore >= 60) {
      drivers.push("Strong orderbook imbalance supports directional move");
    }
    if (scores.proximityScore >= 60) {
      drivers.push("Thin liquidity located immediately adjacent to spot");
    }
    if (scores.accelerationScore >= 60) {
      drivers.push("Confluence indicators align with vacuum direction");
    }

    // Direction-specific explanations
    if (direction === "UP") {
      drivers.push("Ask side weakness and bid pressure increase upside vacuum risk");
    } else if (direction === "DOWN") {
      drivers.push("Bid side weakness and ask pressure increase downside vacuum risk");
    }

    // Invalidation explanations
    if (!confirmed && overallScore >= 50) {
      if (scores.proximityScore < 40) {
        invalidation.push("Vacuum zone too distant from current price");
      }
      if (direction === "NEUTRAL") {
        invalidation.push("Insufficient directional bias for confirmation");
      }
      if (scores.accelerationScore < 30) {
        invalidation.push("Lack of confluence support reduces confidence");
      }
    }

    if (thinRegions.length === 0) {
      invalidation.push("No meaningful thin liquidity regions identified");
    }

    return { summary, drivers, invalidation };
  }

  /**
   * Helper methods
   */
  private getLocalAverageDensity(bands: LiquidityBand[], targetBand: LiquidityBand): number {
    const windowSize = 5;
    const targetIndex = bands.findIndex(b => b.midPrice === targetBand.midPrice);
    
    if (targetIndex === -1) return 0;

    const startIdx = Math.max(0, targetIndex - windowSize);
    const endIdx = Math.min(bands.length - 1, targetIndex + windowSize);
    
    let sum = 0;
    let count = 0;
    
    for (let i = startIdx; i <= endIdx; i++) {
      sum += bands[i].totalSize;
      count++;
    }
    
    return count > 0 ? sum / count : 0;
  }

  private groupContiguousBands(bands: LiquidityBand[]): LiquidityBand[][] {
    const groups: LiquidityBand[][] = [];
    const sortedBands = [...bands].sort((a, b) => a.midPrice - b.midPrice);
    
    let currentGroup: LiquidityBand[] = [];
    
    for (const band of sortedBands) {
      if (currentGroup.length === 0) {
        currentGroup.push(band);
      } else {
        const lastBand = currentGroup[currentGroup.length - 1];
        const gap = band.midPrice - lastBand.midPrice;
        
        // Check if bands are contiguous (gap less than 2x band width)
        if (gap <= (band.endPrice - band.startPrice) * 2) {
          currentGroup.push(band);
        } else {
          if (currentGroup.length > 0) {
            groups.push(currentGroup);
          }
          currentGroup = [band];
        }
      }
    }
    
    if (currentGroup.length > 0) {
      groups.push(currentGroup);
    }
    
    return groups;
  }

  private findTargetCluster(bands: LiquidityBand[], spotPrice: number): number | null {
    // Find the next meaningful liquidity cluster after the thin region
    const direction = bands[0].direction;
    const searchBands = direction === "ABOVE" ? 
      bands.filter(b => b.midPrice > spotPrice) :
      bands.filter(b => b.midPrice < spotPrice);

    for (const band of searchBands) {
      if (!band.isThin && band.totalSize > 0) {
        return band.midPrice;
      }
    }

    return null;
  }

  private calculateTravelEfficiency(bands: LiquidityBand[], targetCluster: number | null): number {
    if (!targetCluster) return 0;

    const startPrice = Math.min(...bands.map(b => b.startPrice));
    const endPrice = Math.max(...bands.map(b => b.endPrice));
    const travelDistance = Math.abs(targetCluster - (startPrice + endPrice) / 2);

    // Efficiency inversely proportional to travel distance
    return Math.max(0, 100 - (travelDistance / 0.01) * 100); // 1% travel = 0 efficiency
  }

  private buildClusterMap(input: VacuumEngineInput): Map<string, number[]> {
    const clusterMap = new Map<string, number[]>();
    
    if (input.nearestBookClusters) {
      clusterMap.set("above", input.nearestBookClusters.above);
      clusterMap.set("below", input.nearestBookClusters.below);
    }

    if (input.liquidityHeatZones) {
      const heatZones = input.liquidityHeatZones.map(zone => (zone.priceStart + zone.priceEnd) / 2);
      clusterMap.set("heatmap", heatZones);
    }

    return clusterMap;
  }

  /**
   * Create low quality result for insufficient data
   */
  private createLowQualityResult(): VacuumAnalysisResult {
    return {
      vacuumRisk: "LOW",
      vacuumScore: 0,
      vacuumType: "NONE",
      vacuumDirection: "NEUTRAL",
      vacuumProximity: "FAR",
      nearestThinLiquidityZone: null,
      nearestThinLiquidityDirection: "NONE",
      nearestThinLiquidityScore: 0,
      confirmedVacuumActive: false,
      activeZones: [],
      explanation: {
        summary: ["Insufficient market data for vacuum analysis"],
        drivers: ["Data quality below minimum thresholds"],
        invalidation: ["Incomplete orderbook or price data"]
      }
    };
  }

}

// Export singleton instance
export const liquidityVacuumEngine = new LiquidityVacuumEngine();
