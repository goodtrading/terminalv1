/**
 * Mobile Adapter - Exposes terminal state in app mobile compatible payload
 * Maps real terminal state to mobile-friendly format
 */

import { TerminalState } from "./terminal-state";

export interface MobileTerminalState {
  // Core market state
  market: {
    spot: number | null;
    totalGex: number;
    gammaRegime: "LONG_GAMMA" | "SHORT_GAMMA" | "TRANSITION" | "NEUTRAL";
    gammaFlip: number | null;
    distanceToFlip: number | null;
    marketMode: {
      type: string | null;
      description: string | null;
      confidence: number | null;
      drivers: string[];
    };
    transitionZone: {
      start: number | null;
      end: number | null;
    };
  };
  
  // Institutional bias from engines
  bias: {
    type: "BULLISH_COMPRESSION" | "BEARISH_COMPRESSION" | "BULLISH_EXPANSION" | "BEARISH_EXPANSION" | "FRAGILE_TRANSITION" | "SQUEEZE_SETUP" | "NEUTRAL_CHOP";
    confidence: number;
    drivers: string[];
    invalidation: string;
    horizon: "INTRADAY" | "SWING" | "EVENT_DRIVEN";
  };
  
  // Risk and volatility state
  risk: {
    cascadeRisk: "LOW" | "MEDIUM" | "HIGH" | "EXTREME";
    cascadeDirection: "UP" | "DOWN" | "TWO_SIDED" | "NONE";
    squeezeProbability: number;
    squeezeDirection: "UP" | "DOWN" | "NONE";
    squeezeType: "SHORT_SQUEEZE" | "LONG_SQUEEZE" | "GAMMA_SQUEEZE" | "NONE";
    volatilityState: "COMPRESSING" | "NORMAL" | "EXPANDING";
  };
  
  // Active scenarios
  scenarios: Array<{
    id: number;
    type: "BASE" | "ALT" | "VOL";
    probability: number;
    thesis: string;
    levels: string[];
    confirmation: string[];
    invalidation: string;
  }>;
  
  // Key levels
  levels: {
    callWall: number | null;
    putWall: number | null;
    dealerPivot: number | null;
    gammaMagnets: number[];
    shortGammaPocket: {
      start: number | null;
      end: number | null;
    };
  };
  
  // Active alerts
  alerts: Array<{
    type: "CASCADE_RISK" | "SQUEEZE_SETUP" | "LIQUIDITY_SWEEP" | "ABSORPTION" | "GAMMA_FLIP_PROXIMITY";
    severity: "LOW" | "MEDIUM" | "HIGH" | "EXTREME";
    message: string;
    trigger: string;
    timestamp: number;
  }>;
  
  // Meta information
  meta: {
    timestamp: number;
    dataSource: string;
    tickerStatus: "fresh" | "stale" | "unavailable";
    lastUpdated: number;
    coherence: number;
  };
}

export function adaptTerminalStateForMobile(terminalState: TerminalState): MobileTerminalState {
  const now = Date.now();
  
  // Extract bias from institutional bias engine
  const biasEngine = terminalState.positioning?.institutionalBiasEngine;
  const bias = {
    type: biasEngine?.institutionalBias ?? "NEUTRAL_CHOP",
    confidence: biasEngine?.biasConfidence ?? 50,
    drivers: biasEngine?.biasDrivers ?? [],
    invalidation: biasEngine?.biasInvalidation ?? "No invalidation available",
    horizon: biasEngine?.biasHorizon ?? "INTRADAY"
  };
  
  // Extract risk state from various engines
  const cascadeEngine = terminalState.positioning?.liquidityCascadeEngine;
  const squeezeEngine = terminalState.positioning?.squeezeProbabilityEngine;
  const gammaEngine = terminalState.positioning?.gammaCurveEngine;
  const marketModeEngine = terminalState.positioning?.marketModeEngine;
  const marketRegime = gammaEngine?.dealerRegime || "TRANSITION";
  const marketMode = {
    type: typeof marketModeEngine?.marketMode === "string" ? marketModeEngine.marketMode : null,
    description:
      typeof marketModeEngine?.marketModeDescription === "string"
        ? marketModeEngine.marketModeDescription
        : null,
    confidence:
      typeof marketModeEngine?.marketModeConfidence === "number" &&
      Number.isFinite(marketModeEngine.marketModeConfidence)
        ? marketModeEngine.marketModeConfidence
        : null,
    drivers: Array.isArray(marketModeEngine?.marketModeReason)
      ? marketModeEngine.marketModeReason.filter((reason: unknown): reason is string => typeof reason === "string")
      : [],
  };
  
  const risk = {
    cascadeRisk: (cascadeEngine?.cascadeRisk as "LOW" | "MEDIUM" | "HIGH" | "EXTREME") ?? "LOW",
    cascadeDirection: (cascadeEngine?.cascadeDirection as "UP" | "DOWN" | "TWO_SIDED" | "NONE") ?? "NONE",
    squeezeProbability: squeezeEngine?.squeezeProbability ?? 0,
    squeezeDirection: (squeezeEngine?.squeezeDirection as "UP" | "DOWN" | "NONE") ?? "NONE",
    squeezeType: (squeezeEngine?.squeezeType as "SHORT_SQUEEZE" | "LONG_SQUEEZE" | "GAMMA_SQUEEZE" | "NONE") ?? "NONE",
    volatilityState: (marketRegime === "LONG_GAMMA" ? "COMPRESSING" : 
                    marketRegime === "SHORT_GAMMA" ? "EXPANDING" : "NORMAL") as "COMPRESSING" | "NORMAL" | "EXPANDING"
  };
  
  // Generate alerts based on current state
  const alerts: MobileTerminalState['alerts'] = [];
  
  if (risk.cascadeRisk === "HIGH" || risk.cascadeRisk === "EXTREME") {
    alerts.push({
      type: "CASCADE_RISK",
      severity: risk.cascadeRisk,
      message: `Elevated cascade risk detected: ${risk.cascadeDirection}`,
      trigger: cascadeEngine?.cascadeTrigger ?? "Unknown trigger",
      timestamp: now
    });
  }
  
  if (risk.squeezeProbability > 60) {
    alerts.push({
      type: "SQUEEZE_SETUP",
      severity: risk.squeezeProbability > 80 ? "HIGH" : "MEDIUM",
      message: `High squeeze probability: ${risk.squeezeProbability}%`,
      trigger: squeezeEngine?.squeezeTrigger ?? "Unknown trigger",
      timestamp: now
    });
  }
  
  if (terminalState.positioning?.liquiditySweepDetector?.sweepRisk === "HIGH") {
    const sweepDetector = terminalState.positioning.liquiditySweepDetector;
    alerts.push({
      type: "LIQUIDITY_SWEEP",
      severity: "HIGH",
      message: `Liquidity sweep risk: ${sweepDetector.sweepDirection}`,
      trigger: sweepDetector.sweepTrigger ?? "Unknown trigger",
      timestamp: now
    });
  }
  
  if (terminalState.positioning?.absorption?.status === "ACTIVE") {
    const absorption = terminalState.positioning.absorption;
    alerts.push({
      type: "ABSORPTION",
      severity: "MEDIUM",
      message: `Absorption active: ${absorption.side} side`,
      trigger: `Confidence: ${absorption.confidence}%`,
      timestamp: now
    });
  }
  
  if (terminalState.market?.distanceToFlip && terminalState.market.distanceToFlip < 2) {
    alerts.push({
      type: "GAMMA_FLIP_PROXIMITY",
      severity: "MEDIUM",
      message: `Near gamma flip: ${terminalState.market.distanceToFlip.toFixed(2)}% away`,
      trigger: `Flip level: ${terminalState.market.gammaFlip}`,
      timestamp: now
    });
  }
  
  // Build mobile-compatible state
  const mobileState: MobileTerminalState = {
    market: {
      spot: terminalState.ticker?.price ?? null,
      totalGex: terminalState.market?.totalGex ?? 0,
      gammaRegime: terminalState.market?.gammaRegime ?? "NEUTRAL",
      gammaFlip: terminalState.market?.gammaFlip ?? null,
      distanceToFlip: terminalState.market?.distanceToFlip ?? null,
      marketMode,
      transitionZone: {
        start: terminalState.market?.transitionZoneStart ?? null,
        end: terminalState.market?.transitionZoneEnd ?? null
      }
    },
    
    bias,
    risk,
    
    scenarios: terminalState.scenarios?.map(s => ({
      id: s.id,
      type: s.type,
      probability: s.probability,
      thesis: s.thesis,
      levels: s.levels,
      confirmation: s.confirmation,
      invalidation: s.invalidation
    })) ?? [],
    
    levels: {
      callWall: terminalState.positioning?.callWall ?? null,
      putWall: terminalState.positioning?.putWall ?? null,
      dealerPivot: terminalState.positioning?.dealerPivot ?? null,
      gammaMagnets: terminalState.levels?.gammaMagnets ?? [],
      shortGammaPocket: {
        start: terminalState.levels?.shortGammaPocketStart ?? null,
        end: terminalState.levels?.shortGammaPocketEnd ?? null
      }
    },
    
    alerts,
    
    meta: {
      timestamp: terminalState.timestamp,
      dataSource: terminalState.options?.asOf ? "deribit" : "storage",
      tickerStatus: terminalState.tickerStatus,
      lastUpdated: terminalState.optionsLastUpdated ?? 0,
      coherence: terminalState.coherence?.score ?? 0
    }
  };
  
  return mobileState;
}

// Helper function to create mobile API endpoint
export function createMobileEndpoint(terminalState: TerminalState) {
  return {
    status: "success",
    data: adaptTerminalStateForMobile(terminalState),
    timestamp: Date.now()
  };
}
