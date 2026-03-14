import fs from "fs";
import path from "path";
import { oiToUsd } from "./formatNotional.js";

export type GammaRegime = "LONG_GAMMA" | "SHORT_GAMMA" | "NEUTRAL";

export interface StrikeRow {
  strike: number;
  totalGex: number;
  callGex?: number;
  putGex?: number;
  totalOiContracts?: number;
  callOiContracts?: number;
  putOiContracts?: number;
  oiUsd?: number;
}

export interface DeribitOptionsSnapshot {
  asOf: string | null;
  /** Fallback spot from GEX output (when ticker not cached) */
  spot?: number | null;
  totalGex: number;
  gammaRegime: GammaRegime;
  gammaFlip: number | null;
  topMagnets: Array<{ strike: number; totalGex: number }>;
  strikes: StrikeRow[];
  strikeCount: number;
  /** Enriched when spot available */
  primaryOiCluster?: number | null;
  primaryOiClusterUsd?: number | null;
  callWallUsd?: number | null;
  putWallUsd?: number | null;
}

const PROJECT_ROOT = process.cwd();
const OUTPUT_FILE = path.join(PROJECT_ROOT, "deribit_gex_output.json");

const FALLBACK_SNAPSHOT: DeribitOptionsSnapshot = {
  asOf: null,
  spot: null,
  totalGex: 0,
  gammaRegime: "NEUTRAL",
  gammaFlip: null,
  topMagnets: [],
  strikes: [],
  strikeCount: 0,
};

export function getDeribitOptionsSnapshot(): DeribitOptionsSnapshot {
  try {
    if (!fs.existsSync(OUTPUT_FILE)) {
      console.warn("[OptionsSnapshot] gex file missing, system running in degraded mode");
      return FALLBACK_SNAPSHOT;
    }
    const raw = fs.readFileSync(OUTPUT_FILE, "utf8");
    if (!raw.trim()) {
      console.log("[DeribitOptions] fallback used: empty deribit_gex_output.json");
      return FALLBACK_SNAPSHOT;
    }
    const parsed = JSON.parse(raw);
    const asOf = typeof parsed.asOf === "string" ? parsed.asOf : null;
    const spotFromFile =
      typeof parsed.spot === "number" && Number.isFinite(parsed.spot) && parsed.spot > 0
        ? parsed.spot
        : null;
    const totalGex =
      typeof parsed.totalGex === "number" && Number.isFinite(parsed.totalGex)
        ? parsed.totalGex
        : 0;
    const gammaRegime: GammaRegime =
      parsed.gammaRegime === "LONG_GAMMA" || parsed.gammaRegime === "SHORT_GAMMA"
        ? parsed.gammaRegime
        : "NEUTRAL";
    const gammaFlip =
      typeof parsed.gammaFlip === "number" && Number.isFinite(parsed.gammaFlip)
        ? parsed.gammaFlip
        : null;
    const rawStrikes = Array.isArray(parsed.strikes) ? parsed.strikes : [];
    const strikes: StrikeRow[] = rawStrikes
      .map((s: unknown) => {
        if (!s || typeof s !== "object") return null;
        const row = s as Record<string, unknown>;
        const strike = Number(row.strike);
        if (!Number.isFinite(strike) || strike <= 0) return null;
        const totalOi = Number(row.totalOiContracts ?? 0);
        const callOi = Number(row.callOiContracts ?? 0);
        const putOi = Number(row.putOiContracts ?? 0);
        const totalOiSafe = Number.isFinite(totalOi) ? totalOi : callOi + putOi;
        if (totalOiSafe <= 0) return null;
        const totalGex = Number.isFinite(Number(row.totalGex)) ? Number(row.totalGex) : 0;
        return {
          strike,
          totalGex,
          callGex: Number.isFinite(Number(row.callGex)) ? Number(row.callGex) : undefined,
          putGex: Number.isFinite(Number(row.putGex)) ? Number(row.putGex) : undefined,
          totalOiContracts: totalOiSafe,
          callOiContracts: Number.isFinite(callOi) ? callOi : 0,
          putOiContracts: Number.isFinite(putOi) ? putOi : 0,
        };
      })
      .filter((r): r is StrikeRow => r != null);
    const strikeCount = strikes.length;
    console.log("[OptionsSnapshot] parsed.strikes?.length=" + rawStrikes.length + " mapped=" + strikeCount);
    const topMagnetsRaw = Array.isArray(parsed.topMagnets) ? parsed.topMagnets : [];
    const topMagnets: Array<{ strike: number; totalGex: number }> = topMagnetsRaw
      .map((m: any) => {
        const strike =
          m && typeof m.strike === "number" && Number.isFinite(m.strike) ? m.strike : null;
        const mgex =
          m && typeof m.totalGex === "number" && Number.isFinite(m.totalGex)
            ? m.totalGex
            : null;
        if (strike == null || mgex == null) return null;
        return { strike, totalGex: mgex };
      })
      .filter((m: any) => m != null);

    const snapshot: DeribitOptionsSnapshot = {
      asOf,
      spot: spotFromFile,
      totalGex,
      gammaRegime,
      gammaFlip,
      topMagnets,
      strikes,
      strikeCount,
    };

    console.log(
      `[DeribitOptions] loaded asOf=${snapshot.asOf ?? "n/a"} regime=${snapshot.gammaRegime} flip=${
        snapshot.gammaFlip ?? "n/a"
      } strikes=${snapshot.strikeCount} mappedStrikeRows=${strikes.length}`
    );

    return {
      asOf: snapshot.asOf,
      spot: snapshot.spot,
      totalGex: snapshot.totalGex,
      gammaRegime: snapshot.gammaRegime,
      gammaFlip: snapshot.gammaFlip,
      topMagnets: snapshot.topMagnets,
      strikes: snapshot.strikes,
      strikeCount: snapshot.strikeCount,
    };
  } catch (err: any) {
    console.log(
      "[DeribitOptions] fallback used: invalid deribit_gex_output.json",
      err?.message || err
    );
    return FALLBACK_SNAPSHOT;
  }
}

/** Find nearest strike to target. Uses any strike; no strict tolerance. */
export function findNearestStrikeRow(
  strikes: StrikeRow[],
  targetStrike: number
): StrikeRow | null {
  if (!strikes?.length) return null;
  return strikes.reduce<StrikeRow>((best, s) => {
    const d = Math.abs(s.strike - targetStrike);
    const bestD = Math.abs(best.strike - targetStrike);
    return d < bestD ? s : best;
  });
}

/** Enrich options snapshot with OI USD using spot. Deribit: 1 contract = 1 BTC. */
export function enrichOptionsWithOINotional(
  snapshot: DeribitOptionsSnapshot,
  spotPrice: number,
  callWall: number | null,
  putWall: number | null,
  contractMultiplier: number = 1
): DeribitOptionsSnapshot {
  if (!spotPrice || spotPrice <= 0 || !snapshot.strikes?.length) {
    return {
      asOf: snapshot.asOf,
      spot: snapshot.spot,
      totalGex: snapshot.totalGex,
      gammaRegime: snapshot.gammaRegime,
      gammaFlip: snapshot.gammaFlip,
      topMagnets: snapshot.topMagnets,
      strikes: snapshot.strikes,
      strikeCount: snapshot.strikeCount,
      primaryOiCluster: null,
      primaryOiClusterUsd: null,
      callWallUsd: null,
      putWallUsd: null,
    };
  }

  const strikesWithUsd = snapshot.strikes.map((s) => ({
    ...s,
    oiUsd: oiToUsd(s.totalOiContracts ?? 0, spotPrice, contractMultiplier),
  }));

  const primary =
    strikesWithUsd.length > 0
      ? strikesWithUsd.reduce(
          (best, s) => ((s.totalOiContracts ?? 0) > (best.totalOiContracts ?? 0) ? s : best),
          strikesWithUsd[0]
        )
      : null;
  let primaryOiCluster = primary?.strike ?? null;
  let primaryOiClusterUsd = primary ? oiToUsd(primary.totalOiContracts ?? 0, spotPrice, contractMultiplier) : null;

  if (!primaryOiCluster && primaryOiClusterUsd == null && strikesWithUsd.length > 0) {
    const byOiUsd = [...strikesWithUsd].sort((a, b) => (b.oiUsd ?? 0) - (a.oiUsd ?? 0));
    const top = byOiUsd[0];
    if (top && (top.oiUsd ?? 0) > 0) {
      primaryOiCluster = top.strike;
      primaryOiClusterUsd = top.oiUsd ?? oiToUsd(top.totalOiContracts ?? 0, spotPrice, contractMultiplier);
    }
  }

  const callStrike = callWall != null ? findNearestStrikeRow(strikesWithUsd, callWall) : null;
  const putStrike = putWall != null ? findNearestStrikeRow(strikesWithUsd, putWall) : null;
  const callWallUsd = callStrike
    ? oiToUsd(callStrike.callOiContracts ?? callStrike.totalOiContracts ?? 0, spotPrice, contractMultiplier)
    : null;
  const putWallUsd = putStrike
    ? oiToUsd(putStrike.putOiContracts ?? putStrike.totalOiContracts ?? 0, spotPrice, contractMultiplier)
    : null;

  const enriched: DeribitOptionsSnapshot = {
    asOf: snapshot.asOf,
    spot: snapshot.spot,
    totalGex: snapshot.totalGex,
    gammaRegime: snapshot.gammaRegime,
    gammaFlip: snapshot.gammaFlip,
    topMagnets: snapshot.topMagnets,
    strikes: strikesWithUsd,
    strikeCount: strikesWithUsd.length,
    primaryOiCluster,
    primaryOiClusterUsd,
    callWallUsd,
    putWallUsd,
  };
  console.log("[OptionsSnapshot] enriched strikes=" + enriched.strikes?.length + " primaryOiCluster=" + enriched.primaryOiCluster);
  return enriched;
}

