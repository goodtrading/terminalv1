import { computeLevelTiming } from "@/lib/computeLevelTiming";
import type {
  LevelTimingContext,
  LevelTimingMeta,
  OperationalLevel,
  OperationalLevelKind,
  OperationalLevelSource,
} from "@/lib/levelTimingTypes";

function finiteNum(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export function buildLevelTimingContextFromState(
  currentPrice: number,
  state: any,
  timeframeSec?: number,
): LevelTimingContext {
  const positioning = state?.positioning ?? {};
  const levels = state?.levels ?? {};
  const market = state?.market ?? {};
  const engines = state?.positioning_engines ?? {};
  return {
    nowTs: Date.now(),
    currentPrice,
    timeframeSec,
    gammaRegime: market?.gammaRegime ?? positioning?.marketModeEngine?.marketMode,
    gammaFlip: finiteNum(market?.gammaFlip),
    transitionZoneStart: finiteNum(market?.transitionZoneStart),
    transitionZoneEnd: finiteNum(market?.transitionZoneEnd),
    sweepRisk: engines?.liquiditySweepDetector?.sweepRisk,
    sweepDirection: engines?.liquiditySweepDetector?.sweepDirection,
    absorptionStatus: positioning?.absorption?.status,
    liquidityPressure: engines?.liquidityHeatmap?.liquidityPressure,
    playbookState: positioning?.tradeDecisionEngine?.tradeState,
    playbookBias: positioning?.institutionalBiasEngine?.institutionalBias,
    clusterStrength: Array.isArray(levels?.gammaMagnets) && levels.gammaMagnets.length > 0 ? 0.58 : 0.35,
    interactionScore: positioning?.absorption?.confidence != null ? Math.max(0, Math.min(1, positioning.absorption.confidence / 100)) : undefined,
  };
}

export function horizonShort(h: LevelTimingMeta["horizon"]): "SCALP" | "INTRA" | "SWING" {
  if (h === "scalp") return "SCALP";
  if (h === "intraday") return "INTRA";
  return "SWING";
}

export function urgencyShort(u: LevelTimingMeta["urgency"]): "H" | "M" | "L" {
  if (u === "high") return "H";
  if (u === "medium") return "M";
  return "L";
}

export function timingTitleSuffix(meta?: LevelTimingMeta): string {
  if (!meta) return "";
  return ` ${horizonShort(meta.horizon)} ${meta.urgency.toUpperCase()} ${meta.state.toUpperCase()} ${meta.score}`;
}

export function applyTimingToLevel(level: OperationalLevel, ctx: LevelTimingContext): OperationalLevel {
  return {
    ...level,
    timingMeta: computeLevelTiming(level, ctx),
  };
}

function pushIfFinite(
  arr: OperationalLevel[],
  price: unknown,
  kind: OperationalLevelKind,
  label: string,
  source: OperationalLevelSource,
  strength?: number,
  structural?: boolean,
): void {
  const p = finiteNum(price);
  if (p == null) return;
  arr.push({ price: p, kind, label, source, strength, structural });
}

export function collectOperationalLevelsFromState(state: any, currentPrice: number, timeframeSec?: number): OperationalLevel[] {
  const positioning = state?.positioning ?? {};
  const levels = state?.levels ?? {};
  const market = state?.market ?? {};
  const engines = state?.positioning_engines ?? {};
  const out: OperationalLevel[] = [];

  pushIfFinite(out, positioning?.activeCallWall ?? positioning?.callWall, "call_wall", "CALL WALL", "options", 0.86, true);
  pushIfFinite(out, positioning?.activePutWall ?? positioning?.putWall, "put_wall", "PUT WALL", "options", 0.86, true);
  pushIfFinite(out, positioning?.dealerPivot, "dealer_pivot", "PIVOT", "options", 0.62, false);
  pushIfFinite(out, market?.gammaFlip, "gamma_flip", "GAMMA FLIP", "gamma", 0.9, true);

  if (Array.isArray(levels?.gammaMagnets)) {
    for (const m of levels.gammaMagnets.slice(0, 8)) {
      pushIfFinite(out, m, "gamma_magnet", "GAMMA MAGNET", "gamma", 0.68, true);
    }
  }

  const sw = engines?.liquiditySweepDetector;
  const triggerText = sw?.sweepTrigger ?? sw?.trigger;
  if (typeof triggerText === "string") {
    const m = triggerText.match(/(\d{4,6}(?:\.\d+)?)/);
    if (m) pushIfFinite(out, Number(m[1]), "sweep_trigger", "SWEEP TRIGGER", "sweep", 0.78, false);
  }

  const abs = positioning?.absorption;
  if (abs?.zoneLow != null && abs?.zoneHigh != null) {
    pushIfFinite(out, (abs.zoneLow + abs.zoneHigh) / 2, "absorption_zone", "ABSORPTION", "absorption", 0.74, false);
  }

  const heatZones = engines?.liquidityHeatmap?.liquidityHeatZones;
  if (Array.isArray(heatZones)) {
    for (const z of heatZones.slice(0, 6)) {
      const mid = finiteNum(z?.priceStart) != null && finiteNum(z?.priceEnd) != null ? (z.priceStart + z.priceEnd) / 2 : null;
      if (mid != null) {
        pushIfFinite(out, mid, "structure_level", "LIQ CLUSTER", "liquidity", Math.max(0.1, Math.min(1, Number(z?.intensity ?? 0.2))), false);
      }
    }
  }

  const ctx = buildLevelTimingContextFromState(currentPrice, state, timeframeSec);
  return out.map((l) => applyTimingToLevel(l, ctx));
}

export function prioritizeLevelsForPlaybook(levels: OperationalLevel[]): {
  activeTactical: OperationalLevel[];
  intraday: OperationalLevel[];
  structural: OperationalLevel[];
} {
  const activeTactical = levels
    .filter((l) => l.timingMeta?.state === "active" && l.timingMeta?.horizon === "scalp")
    .sort((a, b) => (b.timingMeta?.score ?? 0) - (a.timingMeta?.score ?? 0))
    .slice(0, 5);
  const intraday = levels
    .filter((l) => l.timingMeta?.horizon === "intraday" && l.timingMeta?.state !== "invalidated")
    .sort((a, b) => (b.timingMeta?.score ?? 0) - (a.timingMeta?.score ?? 0))
    .slice(0, 8);
  const structural = levels
    .filter((l) => l.structural === true || l.timingMeta?.horizon === "swing")
    .sort((a, b) => (b.timingMeta?.score ?? 0) - (a.timingMeta?.score ?? 0))
    .slice(0, 8);
  return { activeTactical, intraday, structural };
}

