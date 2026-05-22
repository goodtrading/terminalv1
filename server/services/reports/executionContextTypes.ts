export interface ExecutionContextSnapshot {
  timestamp: number;
  symbol: string;
  source: "paper" | "bingx";
  brokerMode: "paper" | "read-only";
  market: {
    spotPrice?: number;
    markPrice?: number;
    marketDataHealth?: "healthy" | "degraded" | "error" | "unknown";
  };
  gamma: {
    regime?: "long_gamma" | "short_gamma" | "transition" | "unknown";
    flip?: number;
    transitionZone?: {
      lower?: number;
      upper?: number;
    };
    nearestMagnet?: {
      price: number;
      distancePct: number;
      type?: "call_wall" | "put_wall" | "gex_magnet" | "unknown";
    };
  };
  liquidity: {
    nearestMagnet?: {
      price: number;
      distancePct: number;
      side?: "bid" | "ask" | "unknown";
      sizeBtc?: number;
    };
    nearestSupport?: {
      price: number;
      distancePct: number;
      source: string;
    };
    nearestResistance?: {
      price: number;
      distancePct: number;
      source: string;
    };
  };
  risk: {
    riskMirrorStatus?: "aligned" | "neutral" | "conflicted" | "danger" | "unknown";
    riskMirrorConfidence?: number;
    stopLossDetected: boolean;
    takeProfitDetected: boolean;
    stopLossPrice?: number;
    takeProfitPrice?: number;
    estimatedLossUsdt?: number;
    estimatedLossAccountPct?: number;
    estimatedGainUsdt?: number;
    estimatedGainAccountPct?: number;
    liquidationPrice?: number;
    distanceToLiquidationPct?: number;
  };
  diagnostics: {
    contextAlignment: "aligned" | "neutral" | "conflicted" | "danger" | "unknown";
    warnings: string[];
    positives: string[];
    summary: string;
  };
}
