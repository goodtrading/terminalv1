import { apiUrl } from "../lib/apiBase";
/**
 * Mobile Terminal State Hook - Backend-First Architecture
 * Consumes /api/mobile/state directly (no frontend adaptation)
 * Real-time data without mocks
 */

import { useQuery } from "@tanstack/react-query";

interface MobileTerminalState {
  market: {
    spot: number | null;
    totalGex: number;
    gammaRegime: "LONG_GAMMA" | "SHORT_GAMMA" | "TRANSITION" | "NEUTRAL";
    gammaFlip: number | null;
    distanceToFlip: number | null;
    transitionZone: {
      start: number | null;
      end: number | null;
    };
  };
  
  bias: {
    type: "BULLISH_COMPRESSION" | "BEARISH_COMPRESSION" | "BULLISH_EXPANSION" | "BEARISH_EXPANSION" | "FRAGILE_TRANSITION" | "SQUEEZE_SETUP" | "NEUTRAL_CHOP";
    confidence: number;
    drivers: string[];
    invalidation: string;
    horizon: "INTRADAY" | "SWING" | "EVENT_DRIVEN";
  };
  
  risk: {
    cascadeRisk: "LOW" | "MEDIUM" | "HIGH" | "EXTREME";
    cascadeDirection: "UP" | "DOWN" | "TWO_SIDED" | "NONE";
    squeezeProbability: number;
    squeezeDirection: "UP" | "DOWN" | "NONE";
    squeezeType: "SHORT_SQUEEZE" | "LONG_SQUEEZE" | "GAMMA_SQUEEZE" | "NONE";
    volatilityState: "COMPRESSING" | "NORMAL" | "EXPANDING";
  };
  
  scenarios: Array<{
    id: number;
    type: "BASE" | "ALT" | "VOL";
    probability: number;
    thesis: string;
    levels: string[];
    confirmation: string[];
    invalidation: string;
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
    trigger: string;
    timestamp: number;
  }>;
  
  meta: {
    timestamp: number;
    dataSource: string;
    tickerStatus: "fresh" | "stale" | "unavailable";
    lastUpdated: number;
    coherence: number;
    terminalPushMerged?: boolean;
    terminalPushAt?: number;
  };
  
  activeSetup: string | null;
  keyZone: string | null;

  /**
   * Cuerpo del POST /api/terminal/push (receptor) expuesto en GET:
   * { marketState: { zone, setup, ... }, zones: [...], alerts: [...] }
   */
  marketState?: {
    zone?: string | number | null;
    setup?: string | null;
    bias?: string;
    gamma?: string;
    scenario?: string;
    probability?: number;
    outlook?: string;
    timeframe?: string;
    gammaLevel?: number;
    netGamma?: string;
    [key: string]: unknown;
  };
  
  // Micro Gamma Flip data
  options?: {
    microFlip?: number | null;
    microFlipStatus?: string;
    microState?: string;
    flipSpread?: number | null;
    [key: string]: unknown;
  };
  zones?: Array<{
    label: string;
    price: string;
    type?: string;
    distance?: string;
  }>;
}

interface MobileResponse {
  status: "success" | "error";
  data: MobileTerminalState;
  timestamp: number;
  source: string;
  /** True si se fusionó el último POST /api/terminal/push saneado */
  pushMerged?: boolean;
}

export function useMobileTerminalState() {
  return useQuery<MobileResponse>({
    queryKey: ["mobile-terminal-state"],
    queryFn: async () => {
      console.log("GT_MOBILE_DEBUG: FETCHING from /api/mobile/state", new Date().toISOString());
      
      // Use backend endpoint directly - no frontend adaptation
      const response = await fetch(apiUrl("/api/mobile/state"));
      if (!response.ok) {
        throw new Error(`Failed to fetch mobile state: ${response.status}`);
      }
      
      const mobileResponse: MobileResponse = await response.json();
      
      console.log("GT_MOBILE_DEBUG: RAW STATE RECEIVED:", {
        timestamp: mobileResponse.timestamp,
        spot: mobileResponse.data.market.spot,
        totalGex: mobileResponse.data.market.totalGex,
        bias: mobileResponse.data.bias.type,
        regime: mobileResponse.data.market.gammaRegime,
        gammaFlip: mobileResponse.data.market.gammaFlip,
        distanceToFlip: mobileResponse.data.market.distanceToFlip,
        alertsCount: mobileResponse.data.alerts.length,
        scenariosCount: mobileResponse.data.scenarios.length,
        fullResponse: mobileResponse
      });
      
      // Debug logging - FRONTEND STATE
    console.log('[MICRO_FLIP_FRONTEND_STATE]', {
      microFlip: mobileResponse.data.options?.microFlip,
      microFlipDisplay: mobileResponse.data.options?.microFlipDisplay,
      microFlipStatus: mobileResponse.data.options?.microFlipStatus,
      microState: mobileResponse.data.options?.microState,
      flipSpread: mobileResponse.data.options?.flipSpread
    });
      
      // Debug logging - FRONTEND DATA CONSUMER
    console.log('[MICRO_FLIP_FRONTEND]', {
      microFlip: mobileResponse.data.options?.microFlip,
      microFlipStatus: mobileResponse.data.options?.microFlipStatus,
      microState: mobileResponse.data.options?.microState,
      flipSpread: mobileResponse.data.options?.flipSpread,
      optionsExists: !!mobileResponse.data.options,
      optionsKeys: mobileResponse.data.options ? Object.keys(mobileResponse.data.options) : []
    });
      
      return mobileResponse;
    },
    refetchInterval: 15_000,
    staleTime: 1000,
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  });
}

export type { MobileTerminalState, MobileResponse };
