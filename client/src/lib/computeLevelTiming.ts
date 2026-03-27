import { LEVEL_TIMING_CONFIG, clamp01, clamp100 } from "@/lib/levelTimingConfig";
import type {
  LevelTimingContext,
  LevelTimingMeta,
  LevelTimingReason,
  OperationalLevel,
} from "@/lib/levelTimingTypes";

function bpsDistance(price: number, ref: number): number {
  if (!Number.isFinite(price) || !Number.isFinite(ref) || ref === 0) return Number.POSITIVE_INFINITY;
  return (Math.abs(price - ref) / Math.abs(ref)) * 10_000;
}

function deriveReasons(level: OperationalLevel, ctx: LevelTimingContext, dBps: number): LevelTimingReason[] {
  const out: LevelTimingReason[] = [];
  if (dBps <= LEVEL_TIMING_CONFIG.scalpDistanceBps) out.push("near_price");
  if (dBps >= LEVEL_TIMING_CONFIG.intradayDistanceBps) out.push("far_from_price");

  const strength = clamp01(level.strength ?? ctx.clusterStrength ?? 0);
  if (strength >= 0.65) out.push("high_liquidity_cluster");
  if (strength <= 0.22) out.push("weak_cluster");

  if (level.kind === "gamma_magnet") out.push("gamma_magnet");
  if (
    level.kind === "gamma_flip" ||
    (typeof ctx.gammaFlip === "number" && bpsDistance(level.price, ctx.gammaFlip) <= LEVEL_TIMING_CONFIG.scalpDistanceBps)
  ) {
    out.push("gamma_flip_near");
  }

  if (String(ctx.gammaRegime).toUpperCase().includes("SHORT")) out.push("short_gamma_acceleration");
  if (String(ctx.gammaRegime).toUpperCase().includes("LONG")) out.push("long_gamma_mean_reversion");

  const absStatus = String(ctx.absorptionStatus ?? "").toUpperCase();
  if (absStatus === "ACTIVE" || absStatus === "CONFIRMED") out.push("active_absorption");

  const sweepRisk = String(ctx.sweepRisk ?? "").toUpperCase();
  if (sweepRisk === "HIGH" || sweepRisk === "EXTREME") out.push("active_sweep");

  if (String(ctx.playbookState).toUpperCase().includes("BREAK")) out.push("structure_break_risk");

  return Array.from(new Set(out));
}

function computeScore(level: OperationalLevel, ctx: LevelTimingContext, dBps: number, reasons: LevelTimingReason[]): number {
  const w = LEVEL_TIMING_CONFIG.timingScoreWeights;
  const prox = clamp01(1 - dBps / (LEVEL_TIMING_CONFIG.intradayDistanceBps * 1.2));
  const strength = clamp01(level.strength ?? ctx.clusterStrength ?? 0);
  const absorption = reasons.includes("active_absorption") ? 1 : 0;
  const sweep = reasons.includes("active_sweep") ? 1 : 0;
  const gamma =
    reasons.includes("gamma_flip_near") || reasons.includes("gamma_magnet")
      ? 1
      : String(ctx.gammaRegime).toUpperCase().includes("SHORT") || String(ctx.gammaRegime).toUpperCase().includes("LONG")
        ? 0.55
        : 0.25;
  const playbook = clamp01(
    String(ctx.playbookState).toUpperCase().includes("BREAK")
      ? 0.9
      : String(ctx.playbookState).toUpperCase().includes("FADE")
        ? 0.7
        : 0.45,
  );

  const raw =
    prox * w.proximity +
    strength * w.clusterStrength +
    absorption * w.absorption +
    sweep * w.sweep +
    gamma * w.gammaContext +
    playbook * w.playbookAlignment;

  return Math.round(clamp100(raw));
}

export function computeLevelTiming(level: OperationalLevel, ctx: LevelTimingContext): LevelTimingMeta {
  const nowTs = Number.isFinite(ctx.nowTs) ? ctx.nowTs : Date.now();
  const dBps = bpsDistance(level.price, ctx.currentPrice);
  const reasons = deriveReasons(level, ctx, dBps);
  const score = computeScore(level, ctx, dBps, reasons);

  const state = (() => {
    if (reasons.includes("expired_context")) return "invalidated" as const;
    if (dBps <= LEVEL_TIMING_CONFIG.activeDistanceBps) return "active" as const;
    if (dBps > LEVEL_TIMING_CONFIG.invalidationBreakBps && level.structural !== true && score < 35) {
      return "invalidated" as const;
    }
    return "pending" as const;
  })();

  const horizon = (() => {
    if (dBps <= LEVEL_TIMING_CONFIG.scalpDistanceBps && (reasons.includes("active_absorption") || reasons.includes("active_sweep") || state === "active")) {
      return "scalp" as const;
    }
    if (dBps <= LEVEL_TIMING_CONFIG.intradayDistanceBps) return "intraday" as const;
    return "swing" as const;
  })();

  const urgency = (() => {
    if (state === "active" || score >= 75 || reasons.includes("active_sweep") || reasons.includes("active_absorption")) {
      return "high" as const;
    }
    if (score >= 48) return "medium" as const;
    return "low" as const;
  })();

  return {
    horizon,
    urgency,
    state,
    score,
    confidence: clamp01(score / 100),
    reasons,
    updatedAt: nowTs,
  };
}

