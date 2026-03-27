export const LEVEL_TIMING_CONFIG = {
  activeDistanceBps: 18,
  scalpDistanceBps: 45,
  intradayDistanceBps: 180,
  invalidationBreakBps: 120,
  timingScoreWeights: {
    proximity: 35,
    clusterStrength: 18,
    absorption: 14,
    sweep: 12,
    gammaContext: 11,
    playbookAlignment: 10,
  },
} as const;

export function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

export function clamp100(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(100, v));
}

