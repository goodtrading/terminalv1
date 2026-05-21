import type {
  DivergenceFilterPrefs,
  DivergenceSignalContext,
  DivergenceSignalBias,
  SpotPerpDivergenceSignal,
  SpotPerpDivergenceType,
} from "./bookmapDivergenceTypes";

const COOLDOWN_MS = 25_000;
const cooldownLastSeen = new Map<string, number>();

export function signalCategory(
  type: SpotPerpDivergenceType,
): "passive" | "aggression" | "confluence" {
  if (type === "BID_CONFLUENCE" || type === "ASK_CONFLUENCE") return "confluence";
  if (type === "SPOT_WALL_ONLY" || type === "PERP_WALL_ONLY") return "passive";
  return "aggression";
}

export function passesTypeFilter(
  type: SpotPerpDivergenceType,
  prefs: DivergenceFilterPrefs,
): boolean {
  const cat = signalCategory(type);
  if (cat === "confluence") return prefs.confluenceSignals;
  if (cat === "passive") return prefs.passiveLiquidity;
  return prefs.aggressionDivergence;
}

export function formatDivergenceContextLabel(
  context: DivergenceSignalContext,
): string {
  switch (context) {
    case "trap":
      return "TRAP";
    case "absorption":
      return "ABSORPTION";
    case "continuation":
      return "CONFIRMATION";
    case "confluence":
      return "CONFLUENCE";
    case "liquidity_warning":
      return "WARNING";
    default:
      return "NEUTRAL";
  }
}

export function formatDivergenceBiasLabel(bias: DivergenceSignalBias): string {
  switch (bias) {
    case "bullish":
      return "BULLISH";
    case "bearish":
      return "BEARISH";
    case "two_sided":
      return "TWO-SIDED";
    case "wait":
      return "WAIT";
  }
}

export function applyDivergenceCooldown(
  signals: SpotPerpDivergenceSignal[],
  priceStep: number,
  nowMs: number,
): { signals: SpotPerpDivergenceSignal[]; filtered: number } {
  let filtered = 0;
  const out: SpotPerpDivergenceSignal[] = [];
  const step = Math.max(1, priceStep);

  for (const s of signals) {
    const bucket = Math.round(s.price / step);
    const key = `${s.type}:${s.side}:${bucket}`;
    const last = cooldownLastSeen.get(key);
    if (last != null && nowMs - last < COOLDOWN_MS) {
      filtered += 1;
      continue;
    }
    cooldownLastSeen.set(key, nowMs);
    out.push(s);
  }

  return { signals: out, filtered };
}

export function suppressDuplicatePriceSignals(
  signals: SpotPerpDivergenceSignal[],
  priceStep: number,
): { signals: SpotPerpDivergenceSignal[]; suppressed: number } {
  const step = Math.max(1, priceStep);
  const mergeDist = step * 3;
  const sorted = [...signals].sort((a, b) => b.confidence - a.confidence);
  const kept: SpotPerpDivergenceSignal[] = [];
  let suppressed = 0;

  for (const s of sorted) {
    const tooClose = kept.some(
      (k) =>
        Math.abs(k.price - s.price) <= mergeDist &&
        (k.type === s.type || signalCategory(k.type) === signalCategory(s.type)),
    );
    if (tooClose) {
      suppressed += 1;
      continue;
    }
    kept.push(s);
  }

  return { signals: kept, suppressed };
}

export function resetDivergenceCooldown(): void {
  cooldownLastSeen.clear();
}
