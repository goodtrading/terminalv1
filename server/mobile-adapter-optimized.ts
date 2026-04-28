/**
 * Optimized Mobile Adapter - Reduced payload for production
 * Essential fields only, top 3 scenarios/alerts
 */

import { TerminalState } from "./terminal-state";

export interface OptimizedMobileTerminalState {
  market: {
    spot: number | null;
    totalGex: number;
    gammaRegime: "LONG_GAMMA" | "SHORT_GAMMA" | "TRANSITION" | "NEUTRAL";
    gammaFlip: number | null;
    distanceToFlip: number | null;
  };
  
  bias: {
    type: "BULLISH_COMPRESSION" | "BEARISH_COMPRESSION" | "BULLISH_EXPANSION" | "BEARISH_EXPANSION" | "FRAGILE_TRANSITION" | "SQUEEZE_SETUP" | "NEUTRAL_CHOP";
    confidence: number;
    drivers: string[];
  };
  
  risk: {
    cascadeRisk: "LOW" | "MEDIUM" | "HIGH" | "EXTREME";
    squeezeProbability: number;
    volatilityState: "COMPRESSING" | "NORMAL" | "EXPANDING";
  };
  
  scenarios: Array<{
    id: number;
    type: "BASE" | "ALT" | "VOL";
    probability: number;
    thesis: string;
  }>;
  
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
  
  alerts: Array<{
    type: "CASCADE_RISK" | "SQUEEZE_SETUP" | "LIQUIDITY_SWEEP" | "ABSORPTION" | "GAMMA_FLIP_PROXIMITY";
    severity: "LOW" | "MEDIUM" | "HIGH" | "EXTREME";
    message: string;
  }>;
  
  activeSetup: string | null;
  keyZone: string | null;
  
  meta: {
    timestamp: number;
    dataSource: string;
    coherence: number;
  };
}

export async function adaptTerminalStateForMobileOptimized(terminalState: TerminalState): Promise<OptimizedMobileTerminalState> {
  console.log('=== LOG 2 - MOBILE ADAPTER DEBUG ===');
  console.log('[MOBILE ADAPTER] INPUT RECEIVED:', {
    terminalState_exists: !!terminalState,
    terminalState_keys: terminalState ? Object.keys(terminalState) : [],
    positioning_exists: !!terminalState.positioning,
    positioning_keys: terminalState.positioning ? Object.keys(terminalState.positioning) : [],
    levels_exists: !!terminalState.levels,
    levels_keys: terminalState.levels ? Object.keys(terminalState.levels) : [],
    scenarios_exists: !!terminalState.scenarios,
    scenarios_keys: terminalState.scenarios ? Object.keys(terminalState.scenarios) : []
  });
  
  // Log key fields that are causing issues
  console.log('[MOBILE ADAPTER] KEY FIELDS DEBUG:', {
    gammaRegime: terminalState.market?.gammaRegime,
    gammaRegime_fromPositioning: terminalState.positioning?.gammaCurveEngine?.dealerRegime,
    totalGex: terminalState.market?.totalGex,
    gammaFlip: terminalState.market?.gammaFlip,
    distanceToFlip: terminalState.market?.distanceToFlip,
    callWall: terminalState.positioning?.callWall,
    putWall: terminalState.positioning?.putWall,
    dealerPivot: terminalState.positioning?.dealerPivot,
    scenarios_count: terminalState.scenarios?.length || 0,
    institutionalBias: terminalState.positioning?.institutionalBiasEngine?.institutionalBias,
    
    // Active Setup
    activeSetup: terminalState.positioning?.scenarioEngine?.activeSetup,
    
    // Key Zone
    keyZone: terminalState.positioning?.scenarioEngine?.keyZone
  });
  const now = Date.now();
  
  // Extract bias from institutional bias engine
  const biasEngine = terminalState.positioning?.institutionalBiasEngine;
  const bias = {
    type: biasEngine?.institutionalBias ?? "NEUTRAL_CHOP",
    confidence: biasEngine?.biasConfidence ?? 50,
    drivers: biasEngine?.biasDrivers?.slice(0, 3) ?? [] // Top 3 drivers only
  };
  
  // Extract risk state
  const cascadeEngine = terminalState.positioning?.liquidityCascadeEngine;
  const squeezeEngine = terminalState.positioning?.squeezeProbabilityEngine;
  const gammaEngine = terminalState.positioning?.gammaCurveEngine;
  
  const risk = {
    cascadeRisk: cascadeEngine?.cascadeRisk ?? "LOW",
    squeezeProbability: squeezeEngine?.squeezeProbability ?? 0,
    volatilityState: gammaEngine?.volatilityState ?? "NORMAL"
  };
  
  // Extract scenarios (top 3 by probability)
  const scenarioEngine = terminalState.positioning?.scenarioEngine;
  const allScenarios = scenarioEngine?.scenarios || [];
  const topScenarios = allScenarios
    .sort((a: any, b: any) => (b.probability ?? 0) - (a.probability ?? 0))
    .slice(0, 3)
    .map((s: any) => ({
      id: s.id,
      type: s.type,
      probability: s.probability ?? 0,
      thesis: s.thesis
    }));

  // Extract key zone using real data sources (scenarioEngine is obsolete)
  console.log('[MOBILE ADAPTER] KEY ZONE REAL SOURCE DEBUG:', {
    gammaFlip: terminalState.market?.gammaFlip,
    transitionZoneStart: terminalState.market?.transitionZoneStart,
    transitionZoneEnd: terminalState.market?.transitionZoneEnd,
    shortGammaPocketStart: terminalState.levels?.shortGammaPocketStart,
    shortGammaPocketEnd: terminalState.levels?.shortGammaPocketEnd,
    callWall: terminalState.positioning?.callWall,
    putWall: terminalState.positioning?.putWall
  });
  
  // Real keyZone logic - same as frontend deriveKeyZone function
  let keyZone: string | null = null;
  const gammaFlip = terminalState.market?.gammaFlip;
  const transitionZoneStart = terminalState.market?.transitionZoneStart;
  const transitionZoneEnd = terminalState.market?.transitionZoneEnd;
  const shortGammaPocketStart = terminalState.levels?.shortGammaPocketStart;
  const shortGammaPocketEnd = terminalState.levels?.shortGammaPocketEnd;
  const callWall = terminalState.positioning?.callWall;
  const putWall = terminalState.positioning?.putWall;
  
  // Priority 1: Gamma Flip range (if available)
  if (gammaFlip != null && Number.isFinite(gammaFlip)) {
    keyZone = `${Math.round(gammaFlip - 50)}-${Math.round(gammaFlip + 50)}`;
  }
  // Priority 2: Transition Zone (if available)
  else if (transitionZoneStart != null && transitionZoneEnd != null) {
    keyZone = `${Math.round(transitionZoneStart)}-${Math.round(transitionZoneEnd)}`;
  }
  // Priority 3: Short Gamma Pocket (if available)
  else if (shortGammaPocketStart != null && shortGammaPocketEnd != null) {
    keyZone = `${Math.round(shortGammaPocketStart)}-${Math.round(shortGammaPocketEnd)}`;
  }
  // Priority 4: Call/Put Walls range
  else if (callWall != null && putWall != null) {
    const min = Math.min(callWall, putWall);
    const max = Math.max(callWall, putWall);
    keyZone = `${Math.round(min)}-${Math.round(max)}`;
  }
  
  console.log('[MOBILE ADAPTER] DERIVED KEY ZONE:', keyZone);
  
  // activeSetup doesn't exist in current architecture - keeping null for now
  const activeSetup = null;
  
  // Extract alerts (top 3 by severity)
  const alertEngine = terminalState.positioning?.alertEngine;
  const allAlerts = alertEngine?.activeAlerts || [];
  const severityOrder = { EXTREME: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
  const topAlerts = allAlerts
    .sort((a: any, b: any) => (severityOrder[b.severity as keyof typeof severityOrder] || 0) - (severityOrder[a.severity as keyof typeof severityOrder] || 0))
    .slice(0, 3)
    .map((a: any) => ({
      type: a.type,
      severity: a.severity,
      message: a.message
    }));
  
  // Extract market state - Use terminal state directly (the source of truth)
  console.log('[MOBILE ADAPTER] EXTRACTING MARKET STATE FROM TERMINAL STATE');
  
  const market = {
    spot: terminalState.ticker?.price ?? null,
    totalGex: terminalState.market?.totalGex ?? 0,
    gammaRegime: terminalState.market?.gammaRegime ?? "NEUTRAL",
    gammaFlip: terminalState.market?.gammaFlip ?? null,
    distanceToFlip: terminalState.market?.distanceToFlip ?? null
  };

  // Force direct assignment of real data values - NO CONDITIONS
  console.log('[MOBILE ADAPTER] FORCING REAL DATA ASSIGNMENT - NO CONDITIONS');
  
  console.log('[MOBILE ADAPTER] FINAL MARKET VALUES:', market);
  
  // Extract key levels from positioning
  console.log('[MOBILE ADAPTER] LEVELS SOURCE DEBUG:', {
    positioning_exists: !!terminalState.positioning,
    positioning_keys: terminalState.positioning ? Object.keys(terminalState.positioning) : [],
    levels_exists: !!terminalState.levels,
    levels_keys: terminalState.levels ? Object.keys(terminalState.levels) : [],
    callWall_raw: terminalState.positioning?.callWall,
    putWall_raw: terminalState.positioning?.putWall,
    dealerPivot_raw: terminalState.positioning?.dealerPivot,
    gammaMagnets_raw: terminalState.levels?.gammaMagnets,
    shortGammaPocketStart_raw: terminalState.levels?.shortGammaPocketStart,
    shortGammaPocketEnd_raw: terminalState.levels?.shortGammaPocketEnd
  });
  
  const levels = {
    callWall: terminalState.positioning?.callWall ?? null,
    putWall: terminalState.positioning?.putWall ?? null,
    dealerPivot: terminalState.positioning?.dealerPivot ?? null,
    gammaMagnets: terminalState.levels?.gammaMagnets ?? [],
    shortGammaPocket: {
      start: terminalState.levels?.shortGammaPocketStart ?? null,
      end: terminalState.levels?.shortGammaPocketEnd ?? null
    }
  };

  console.log('[MOBILE ADAPTER] LEVELS MAPPED:', levels);

  const result = {
    market,
    bias,
    risk,
    scenarios: topScenarios,
    levels,
    alerts: topAlerts,
    activeSetup,
    keyZone,
    meta: {
      timestamp: now,
      dataSource: "real-time-terminal",
      coherence: (terminalState as any).meta?.coherence ?? 0.8
    }
  };
  
  console.log('[MOBILE ADAPTER] OUTPUT FINAL:', {
    result_keys: Object.keys(result),
    keyZone: result.keyZone,
    activeSetup: result.activeSetup,
    levels: result.levels,
    market: result.market,
    bias: result.bias,
    scenarios_count: result.scenarios?.length || 0,
    alerts_count: result.alerts?.length || 0
  });
  
  console.log('=== LOG 2 - MOBILE ADAPTER END ===');
  
  return result;
}
