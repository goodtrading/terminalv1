export type OptionZoneTag =
  | "ATM"
  | "CALL_WALL"
  | "PUT_WALL"
  | "MAX_OI"
  | "MAX_VOL"
  | "SUPPORT"
  | "RESISTANCE"
  | "MAGNET"
  | "FLIP"
  | "TRANSITION";

/** Adjust detection sensitivity without changing call sites. */
export const ZONE_THRESHOLDS = {
  supportResistanceOiRatio: 0.7,
  magnetOiRatio: 0.7,
  /** Nearest strike within this fraction of spot is marked FLIP when gammaFlip is set. */
  flipProximityPct: 0.005,
} as const;

export type ZoneRowInput = {
  strike: number;
  callOi: number;
  putOi: number;
  totalOi: number;
  totalVolume: number;
};

export type OptionsZoneSummaryInput = {
  gammaFlip?: number | null;
  flipZone?: number | null;
  transitionZoneStart?: number | null;
  transitionZoneEnd?: number | null;
  keySupport?: number | null;
  keyResistance?: number | null;
};

export type OptionsZoneContext = {
  spot: number | null;
  atmStrike: number | null;
  callWallStrike: number | null;
  putWallStrike: number | null;
  callWallOi: number;
  putWallOi: number;
  maxOiStrike: number | null;
  maxVolumeStrike: number | null;
  supportStrikes: number[];
  resistanceStrikes: number[];
  magnetStrikes: number[];
  flipStrikes: number[];
  transitionStrikes: number[];
};

const EMPTY_CONTEXT: OptionsZoneContext = {
  spot: null,
  atmStrike: null,
  callWallStrike: null,
  putWallStrike: null,
  callWallOi: 0,
  putWallOi: 0,
  maxOiStrike: null,
  maxVolumeStrike: null,
  supportStrikes: [],
  resistanceStrikes: [],
  magnetStrikes: [],
  flipStrikes: [],
  transitionStrikes: [],
};

export function safeNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function finitePositive(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function findClosestStrike(rows: ZoneRowInput[], target: number): number | null {
  if (!rows.length || !Number.isFinite(target)) return null;
  let best: number | null = null;
  let minDist = Infinity;
  for (const row of rows) {
    if (!Number.isFinite(row.strike)) continue;
    const dist = Math.abs(row.strike - target);
    if (dist < minDist) {
      minDist = dist;
      best = row.strike;
    }
  }
  return best;
}

export function buildOptionsZoneContext(
  rows: ZoneRowInput[],
  spot: number | null | undefined,
  summary?: OptionsZoneSummaryInput
): OptionsZoneContext {
  if (!rows.length) return { ...EMPTY_CONTEXT };

  const spotNum = finitePositive(spot) ?? (Number.isFinite(Number(spot)) ? Number(spot) : null);
  const ctx: OptionsZoneContext = { ...EMPTY_CONTEXT, spot: spotNum };

  if (spotNum != null) {
    ctx.atmStrike = findClosestStrike(rows, spotNum);
  }

  let maxCallOi = -1;
  let maxPutOi = -1;
  let maxCombinedOi = -1;
  let maxVol = -1;

  for (const row of rows) {
    const strike = safeNumber(row.strike);
    if (strike <= 0) continue;

    const callOi = safeNumber(row.callOi);
    const putOi = safeNumber(row.putOi);
    const totalOi = safeNumber(row.totalOi);
    const totalVolume = safeNumber(row.totalVolume);

    if (callOi > maxCallOi) {
      maxCallOi = callOi;
      ctx.callWallStrike = strike;
      ctx.callWallOi = callOi;
    }
    if (putOi > maxPutOi) {
      maxPutOi = putOi;
      ctx.putWallStrike = strike;
      ctx.putWallOi = putOi;
    }
    if (totalOi > maxCombinedOi) {
      maxCombinedOi = totalOi;
      ctx.maxOiStrike = strike;
    }
    if (totalVolume > maxVol) {
      maxVol = totalVolume;
      ctx.maxVolumeStrike = strike;
    }
  }

  const magnetThreshold =
    maxCombinedOi > 0 ? maxCombinedOi * ZONE_THRESHOLDS.magnetOiRatio : Infinity;
  const supportOiMin =
    ctx.putWallOi > 0 ? ctx.putWallOi * ZONE_THRESHOLDS.supportResistanceOiRatio : Infinity;
  const resistanceOiMin =
    ctx.callWallOi > 0 ? ctx.callWallOi * ZONE_THRESHOLDS.supportResistanceOiRatio : Infinity;

  const supportSet = new Set<number>();
  const resistanceSet = new Set<number>();
  const magnetSet = new Set<number>();

  for (const row of rows) {
    const strike = safeNumber(row.strike);
    if (strike <= 0) continue;

    const callOi = safeNumber(row.callOi);
    const putOi = safeNumber(row.putOi);
    const totalOi = safeNumber(row.totalOi);

    if (totalOi >= magnetThreshold && magnetThreshold > 0) {
      magnetSet.add(strike);
    }

    if (spotNum != null) {
      if (strike < spotNum && putOi >= supportOiMin && supportOiMin > 0) {
        supportSet.add(strike);
      }
      if (strike > spotNum && callOi >= resistanceOiMin && resistanceOiMin > 0) {
        resistanceSet.add(strike);
      }
    }
  }

  ctx.supportStrikes = Array.from(supportSet);
  ctx.resistanceStrikes = Array.from(resistanceSet);
  ctx.magnetStrikes = Array.from(magnetSet);

  const gammaFlip =
    finitePositive(summary?.gammaFlip) ?? finitePositive(summary?.flipZone);
  if (gammaFlip != null) {
    const flipSet = new Set<number>();
    const nearest = findClosestStrike(rows, gammaFlip);
    if (nearest != null) flipSet.add(nearest);

    if (spotNum != null && spotNum > 0) {
      const band = spotNum * ZONE_THRESHOLDS.flipProximityPct;
      for (const row of rows) {
        if (Math.abs(row.strike - gammaFlip) <= band) {
          flipSet.add(row.strike);
        }
      }
    }
    ctx.flipStrikes = Array.from(flipSet);
  }

  const tzStart = finitePositive(summary?.transitionZoneStart);
  const tzEnd = finitePositive(summary?.transitionZoneEnd);
  if (tzStart != null && tzEnd != null) {
    const lo = Math.min(tzStart, tzEnd);
    const hi = Math.max(tzStart, tzEnd);
    const transitionSet = new Set<number>();
    for (const row of rows) {
      if (row.strike >= lo && row.strike <= hi) {
        transitionSet.add(row.strike);
      }
    }
    ctx.transitionStrikes = Array.from(transitionSet);
  }

  return ctx;
}

const SUPPORT_RESISTANCE_TAGS = new Set<OptionZoneTag>(["SUPPORT", "RESISTANCE"]);

export function getOptionZoneTags(strike: number, context: OptionsZoneContext): OptionZoneTag[] {
  if (!Number.isFinite(strike)) return [];

  const tags: OptionZoneTag[] = [];

  if (context.atmStrike === strike) tags.push("ATM");
  if (context.callWallStrike === strike) tags.push("CALL_WALL");
  if (context.putWallStrike === strike) tags.push("PUT_WALL");
  if (context.flipStrikes.includes(strike)) tags.push("FLIP");
  if (context.transitionStrikes.includes(strike)) tags.push("TRANSITION");
  if (context.maxOiStrike === strike) tags.push("MAX_OI");
  if (context.maxVolumeStrike === strike) tags.push("MAX_VOL");
  if (context.magnetStrikes.includes(strike)) tags.push("MAGNET");
  if (context.supportStrikes.includes(strike)) tags.push("SUPPORT");
  if (context.resistanceStrikes.includes(strike)) tags.push("RESISTANCE");

  return tags;
}

/** Visual priority for row background (first match wins). */
export function getPrimaryZoneTag(tags: OptionZoneTag[]): OptionZoneTag | null {
  if (!tags.length) return null;
  const order: OptionZoneTag[] = [
    "ATM",
    "CALL_WALL",
    "PUT_WALL",
    "FLIP",
    "TRANSITION",
    "MAX_OI",
    "MAX_VOL",
    "MAGNET",
    "SUPPORT",
    "RESISTANCE",
  ];
  for (const tag of order) {
    if (tags.includes(tag)) return tag;
  }
  return tags[0] ?? null;
}

export function getZoneRowClassName(tags: OptionZoneTag[]): string {
  const primary = getPrimaryZoneTag(tags);
  switch (primary) {
    case "ATM":
      return "bg-blue-500/[0.07] shadow-[inset_2px_0_0_0_rgba(96,165,250,0.45)]";
    case "CALL_WALL":
      return "bg-emerald-500/[0.06] shadow-[inset_2px_0_0_0_rgba(52,211,153,0.35)]";
    case "PUT_WALL":
      return "bg-red-500/[0.06] shadow-[inset_2px_0_0_0_rgba(248,113,113,0.35)]";
    case "FLIP":
    case "TRANSITION":
      return "bg-amber-500/[0.06] shadow-[inset_2px_0_0_0_rgba(251,191,36,0.35)]";
    case "MAX_OI":
    case "MAX_VOL":
      return "bg-violet-500/[0.06] shadow-[inset_2px_0_0_0_rgba(167,139,250,0.3)]";
    case "MAGNET":
      return "bg-indigo-500/[0.05] shadow-[inset_2px_0_0_0_rgba(129,140,248,0.25)]";
    case "SUPPORT":
      return "bg-cyan-900/[0.12] shadow-[inset_2px_0_0_0_rgba(34,211,238,0.2)]";
    case "RESISTANCE":
      return "bg-orange-900/[0.12] shadow-[inset_2px_0_0_0_rgba(251,146,60,0.2)]";
    default:
      return "";
  }
}

export function getZoneTagLabel(tag: OptionZoneTag): string {
  switch (tag) {
    case "ATM":
      return "ATM";
    case "CALL_WALL":
      return "CALL WALL";
    case "PUT_WALL":
      return "PUT WALL";
    case "MAX_OI":
      return "MAX OI";
    case "MAX_VOL":
      return "MAX VOL";
    case "SUPPORT":
      return "SUPPORT";
    case "RESISTANCE":
      return "RESISTANCE";
    case "MAGNET":
      return "MAGNET";
    case "FLIP":
      return "FLIP";
    case "TRANSITION":
      return "TRANSITION";
    default:
      return tag;
  }
}

export type ZoneBadgeKind =
  | "atm"
  | "callWall"
  | "putWall"
  | "maxOi"
  | "maxVol"
  | "support"
  | "resistance"
  | "magnet"
  | "flip"
  | "transition";

export function getZoneTagBadgeKind(tag: OptionZoneTag): ZoneBadgeKind {
  switch (tag) {
    case "ATM":
      return "atm";
    case "CALL_WALL":
      return "callWall";
    case "PUT_WALL":
      return "putWall";
    case "MAX_OI":
      return "maxOi";
    case "MAX_VOL":
      return "maxVol";
    case "SUPPORT":
      return "support";
    case "RESISTANCE":
      return "resistance";
    case "MAGNET":
      return "magnet";
    case "FLIP":
      return "flip";
    case "TRANSITION":
      return "transition";
    default:
      return "magnet";
  }
}

export function getZoneBadgeClassName(kind: ZoneBadgeKind): string {
  switch (kind) {
    case "atm":
      return "bg-blue-500/15 text-blue-300 border border-blue-500/25";
    case "callWall":
      return "bg-green-500/15 text-green-300 border border-green-500/25";
    case "putWall":
      return "bg-red-500/15 text-red-300 border border-red-500/25";
    case "maxOi":
    case "maxVol":
      return "bg-violet-500/15 text-violet-300 border border-violet-500/25";
    case "magnet":
      return "bg-indigo-500/15 text-indigo-300 border border-indigo-500/25";
    case "support":
      return "bg-cyan-900/30 text-cyan-300 border border-cyan-500/20";
    case "resistance":
      return "bg-orange-900/30 text-orange-300 border border-orange-500/20";
    case "flip":
    case "transition":
      return "bg-amber-500/15 text-amber-300 border border-amber-500/25";
    default:
      return "bg-terminal-panel/50 text-terminal-muted border border-terminal-border/30";
  }
}

/** Sort tags for badge display (walls before magnet, etc.). */
export function sortZoneTagsForDisplay(tags: OptionZoneTag[]): OptionZoneTag[] {
  const order: OptionZoneTag[] = [
    "ATM",
    "CALL_WALL",
    "PUT_WALL",
    "FLIP",
    "TRANSITION",
    "MAX_OI",
    "MAX_VOL",
    "MAGNET",
    "SUPPORT",
    "RESISTANCE",
  ];
  return [...tags].sort((a, b) => order.indexOf(a) - order.indexOf(b));
}

export function formatStrikeCompact(strike: number | null, formatPrice: (v: number) => string): string {
  if (strike == null || !Number.isFinite(strike)) return "—";
  return formatPrice(strike);
}

export function formatStrikeList(
  strikes: number[],
  formatPrice: (v: number) => string,
  max = 3
): string {
  if (!strikes.length) return "—";
  const sorted = [...strikes].sort((a, b) => a - b);
  const shown = sorted.slice(0, max).map((s) => formatPrice(s));
  if (sorted.length > max) return `${shown.join(", ")} +${sorted.length - max}`;
  return shown.join(", ");
}
