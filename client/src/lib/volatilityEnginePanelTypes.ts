export type VolMarketEnergyState =
  | "COMPRESSED"
  | "LOADED"
  | "EXPANDING"
  | "EXHAUSTED";

export type VolExpansionRiskLevel = "LOW" | "MEDIUM" | "HIGH" | "EXTREME";

export type VolTradeQuality = "EXCELLENT" | "GOOD" | "LOW" | "NO TRADE";

export type VolReversalWatch = "INACTIVE" | "ACTIVE" | "HIGH";

export type VolDirectionalBias = "UPSIDE" | "DOWNSIDE" | "TWO-SIDED" | "NEUTRAL";

export type VolActionMode =
  | "NO TRADE"
  | "WAIT TRIGGER"
  | "WAIT CONFIRMATION"
  | "TRAIL / DO NOT FADE"
  | "WAIT ABSORPTION"
  | "FADE RANGE"
  | "PREPARE BREAKOUT"
  | "STAND ASIDE";

export type VolTriggerZone = {
  id: string;
  label: string;
  level: number;
  description: string;
  action: string;
  tone: "upside" | "downside" | "neutral";
  confirmation?: "NONE" | "WEAK" | "MODERATE" | "STRONG";
};

export type VolExpectedMoveRow = {
  horizon: string;
  points: number;
};

export type VolOperationalPlaybookScenario = {
  scenarioStatus: string;
  enabled: boolean;
  condition: string;
  activationTrigger: string;
  confirmation: string;
  blockingReasons: string[];
  targetPrimary: string;
  targetSecondary: string;
  targetExtended: string;
  invalidation: string;
};

export type VolatilityEngineState = {
  executive: {
    headline: string;
    subtext: string;
  };
  status: {
    volState: VolMarketEnergyState;
    cleanExpansion: VolExpansionRiskLevel;
    tradeRisk: VolExpansionRiskLevel;
    bias: VolDirectionalBias;
    action: VolActionMode;
    riskSummary: string;
    gammaStripTag?: string;
    liquidityStripTag?: string;
    conflictStripTag?: string;
    signalAlignment?: string;
    resolutionState?: string;
    executionBias?: string;
  };
  marketEnergy: {
    state: VolMarketEnergyState;
    summary: string;
    cleanExpansionRiskPct: number;
    lateChaseRisk: VolExpansionRiskLevel;
    reversalWatch: VolReversalWatch;
    tags: string[];
  };
  directionalPressure: {
    pressure: string;
    summary: string;
    warning: string;
    tags: string[];
  };
  triggerZones: VolTriggerZone[];
  expectedMove: {
    rows: VolExpectedMoveRow[];
    moveUsedPct: number;
    interpretation: string;
  };
  tradeQuality: {
    label: VolTradeQuality;
    score: number;
    reasons: string[];
  };
  volContext: {
    sectionTitle: string;
    gammaIntegrated: boolean;
    liquidityIntegrated: boolean;
    volRegime: string;
    candleStructure: string;
    expectedBehavior: string;
    interpretation: string;
    gammaRegime: string;
    localGamma: string;
    globalGamma: string;
    dealerBehavior: string;
    gammaImpact: string;
    nearestGammaLevel: { display: string; detail: string } | null;
    levelsCompact: string;
    magnetsCompact: string;
    liquidityRegime: string;
    heatmapPressure: string;
    nearestLiquidityLevel: string;
    orderflowConfirmation: string;
    liquidityVolImpact: string;
    liquidityCompact: string;
    flowCompact: string;
    signalAlignment: string;
    resolutionState: string;
    primaryConflict: string;
    resolutionHint: string;
  };
  operationalPlaybook: {
    mode: string;
    headline: string;
    summary: string;
    currentAction: string;
    upsideScenario: VolOperationalPlaybookScenario;
    downsideScenario: VolOperationalPlaybookScenario;
    avoid: string[];
    nextCheckpoint: string;
  };
  finalPlaybook: {
    bestPlay: string;
    avoid: string;
    invalidation: string;
    executionRule: string;
  };
};
