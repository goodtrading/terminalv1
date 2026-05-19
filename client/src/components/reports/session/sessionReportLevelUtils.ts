import type { LevelContext, LevelSpotRelation, MagnetLevelType, SessionTerminalInput } from "./sessionReportTypes";

/** Magnets beyond this % from spot are macro-only, not intraday operational targets. */
export const FAR_MAGNET_INTRADAY_MAX_PCT = 8;

export function num(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

export function formatPriceShort(n: number): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

/** Signed % from spot to level: (level - spot) / spot * 100 */
export function signedDistancePct(spot: number, level: number): number {
  return ((level - spot) / spot) * 100;
}

export function formatSignedDistancePct(pct: number | null): string {
  if (pct == null || !Number.isFinite(pct)) return "N/A";
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct.toFixed(2)}%`;
}

export function distPctAbs(spot: number, level: number): number {
  return (Math.abs(spot - level) / spot) * 100;
}

export function isNear(spot: number, level: number, pct = 0.35): boolean {
  return distPctAbs(spot, level) <= pct;
}

export function isFarFromSpot(spot: number, level: number): boolean {
  return distPctAbs(spot, level) > FAR_MAGNET_INTRADAY_MAX_PCT;
}

export function levelRelation(spot: number, level: number, testingPct = 0.2): LevelSpotRelation {
  if (isNear(spot, level, testingPct)) return "Testing";
  return level > spot ? "Above Spot" : "Below Spot";
}

export function buildLevelContext(
  price: number | null,
  type: LevelContext["type"],
  spot: number | null,
  testingPct = 0.2,
): LevelContext {
  if (price == null || spot == null) {
    return {
      price,
      type,
      distancePct: null,
      distanceLabel: "N/A",
      relation: "N/A",
    };
  }
  const distancePct = signedDistancePct(spot, price);
  return {
    price,
    type,
    distancePct,
    distanceLabel: formatSignedDistancePct(distancePct),
    relation: levelRelation(spot, price, testingPct),
  };
}

export type MagnetResolve = {
  price: number | null;
  type: MagnetLevelType;
};

export function resolvePrimaryMagnetWithType(
  terminal: SessionTerminalInput,
  spot: number | null,
  liquidityMagnet: number | null,
): MagnetResolve {
  const gravity = terminal.gravityMap?.primaryMagnet;
  if (gravity != null && typeof gravity === "object") {
    const p = num((gravity as { price?: number }).price);
    if (p != null) return { price: p, type: "Gravity Magnet" };
  }
  if (typeof gravity === "number") {
    return { price: gravity, type: "Gravity Magnet" };
  }

  if (liquidityMagnet != null) {
    return { price: liquidityMagnet, type: "Key Level" };
  }

  const magnets = terminal.levels?.gammaMagnets;
  if (Array.isArray(magnets) && magnets.length) {
    if (spot != null) {
      let best = magnets[0]!;
      let bestD = Math.abs(best - spot);
      for (const m of magnets) {
        const d = Math.abs(m - spot);
        if (d < bestD) {
          best = m;
          bestD = d;
        }
      }
      return { price: best, type: "Gamma Magnet" };
    }
    return { price: magnets[0]!, type: "Gamma Magnet" };
  }

  const call = num(terminal.positioning?.callWall);
  const put = num(terminal.positioning?.putWall);
  if (spot != null && call != null && put != null) {
    if (Math.abs(call - spot) <= Math.abs(put - spot)) {
      return { price: call, type: "Call Wall" };
    }
    return { price: put, type: "Put Wall" };
  }
  if (call != null) return { price: call, type: "Call Wall" };
  if (put != null) return { price: put, type: "Put Wall" };

  return { price: null, type: "Fallback Level" };
}

export function resolveLocalFlip(terminal: SessionTerminalInput): number | null {
  const opts = terminal.options;
  return (
    num(opts?.gammaFlipLocal) ??
    num(terminal.market?.gammaFlip) ??
    num(opts?.gammaFlipGlobal) ??
    num(opts?.gammaFlipOperationalLegacy) ??
    null
  );
}
