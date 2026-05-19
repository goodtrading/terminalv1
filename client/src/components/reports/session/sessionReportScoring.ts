export type SessionQualityInput = {
  spot: boolean;
  gamma: boolean;
  flip: boolean;
  magnet: boolean;
  structureOhlc: boolean;
  liquidityEvents: boolean;
  /** Confirmed sweep or absorption (not vacuum-only / inferred). */
  confirmedOrderflow: boolean;
  /** Liquidity events driven by structural inference without confirmed flow. */
  structuralLiquidityOnly: boolean;
  hasValidActiveMagnet: boolean;
  /** No active magnet and only far macro gravity is available. */
  macroMagnetFarOnly: boolean;
  resolutionLive: boolean;
  usedMockFallback: boolean;
};

export function computeSessionQualityScore(input: SessionQualityInput): number {
  let score = 0;
  if (input.spot) score += 15;
  if (input.gamma) score += 15;
  if (input.flip) score += 15;
  if (input.magnet) score += 15;
  if (input.structureOhlc) score += 15;
  if (input.liquidityEvents) score += 10;
  if (input.confirmedOrderflow) score += 10;
  if (input.resolutionLive) score += 5;

  if (!input.confirmedOrderflow) score = Math.min(score, 85);
  if (input.structuralLiquidityOnly) score = Math.min(score, 82);
  if (!input.hasValidActiveMagnet) score = Math.min(score, 80);
  if (input.macroMagnetFarOnly) score = Math.min(score, 78);
  if (input.usedMockFallback) score = Math.min(score, 75);

  const canReach100 =
    input.spot &&
    input.gamma &&
    input.flip &&
    input.magnet &&
    input.structureOhlc &&
    input.liquidityEvents &&
    input.confirmedOrderflow &&
    !input.structuralLiquidityOnly &&
    input.hasValidActiveMagnet &&
    !input.macroMagnetFarOnly &&
    input.resolutionLive &&
    !input.usedMockFallback;

  if (!canReach100) {
    score = Math.min(score, 85);
  }

  return canReach100 ? Math.min(100, Math.max(0, score)) : Math.min(85, Math.max(0, score));
}
