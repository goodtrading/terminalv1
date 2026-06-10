/**
 * Options Engine Refresh Scheduler
 * Refreshes Gamma Flip, Call Wall, Put Wall, Total GEX from Deribit every 3 minutes.
 * Preserves last valid state on failure.
 */
import { storage } from "./storage";
import { DeribitOptionsGateway } from "./deribit-gateway";
import { MarketDataGateway } from "./market-gateway";
import { envInt, isDev, isProduction } from "./lib/runtimeEnv";

const REFRESH_INTERVAL_MS = envInt(
  "OPTIONS_ENGINE_REFRESH_MS",
  isProduction ? 180_000 : 5_000,
);

let refreshTimer: ReturnType<typeof setInterval> | null = null;

export async function refreshOptionsEngine(): Promise<void> {
  try {
    await storage.ensureBootstrapped();
    const { options, source } = await DeribitOptionsGateway.ingestOptions();

    const spot = MarketDataGateway.getCachedTicker()?.price;
    if (spot == null || !Number.isFinite(spot) || spot <= 0) {
      console.error(
        "[OptionsEngine] No spot price available — aborting gamma refresh (no silent fallback)"
      );
      return;
    }
    if (isDev) {
      console.log("[OptionsEngine] SPOT USADO:", spot);
    }

    if (options.length === 0) {
      console.log("[OptionsEngine] No options data, keeping last state");
      return;
    }

    const summary = await DeribitOptionsGateway.getSummary(options, spot, source);

    const totalGex = summary.totalGex ?? 0;
    const gammaFlip = summary.gammaFlip ?? null;
    if (isDev) {
      console.log("[OptionsEngine] GEX CALCULADO:", totalGex);
      console.log("[OptionsEngine] GAMMA FLIP:", gammaFlip);
    }
    const callWall = summary.callWall ?? 0;
    const putWall = summary.putWall ?? 0;
    const s = summary as any;
    const rawActiveCW = s.activeCallWall;
    const rawActivePW = s.activePutWall;
    const rawActiveZH = s.activeGammaZoneHigh;
    const rawActiveZL = s.activeGammaZoneLow;
    // Fallback: use global walls when active range has no strikes
    const activeCallWall = (rawActiveCW != null && rawActiveCW > 0) ? rawActiveCW : (callWall > 0 ? callWall : undefined);
    const activePutWall = (rawActivePW != null && rawActivePW > 0) ? rawActivePW : (putWall > 0 ? putWall : undefined);
    const activeGammaZoneHigh = (rawActiveZH != null && rawActiveZH > 0) ? rawActiveZH : undefined;
    const activeGammaZoneLow = (rawActiveZL != null && rawActiveZL > 0) ? rawActiveZL : undefined;

    const pockets = s.shortGammaPockets ?? [];
    const shortGammaZones = pockets.map((z: { start: number; end: number }) => ({
      startStrike: z.start,
      endStrike: z.end,
    }));

    if (isDev) {
      console.log("[OptionsEngine][PassToStorage]", {
        totalVanna: s.totalVanna,
        totalCharm: s.totalCharm,
      });
    }

    storage.updateFromDeribitSummary(
      {
        totalGex,
        gammaFlip,
        callWall,
        putWall,
        activeCallWall,
        activePutWall,
        activeGammaZoneHigh,
        activeGammaZoneLow,
        gammaMagnets: summary.gammaMagnets ?? [],
        shortGammaZones,
        totalVanna: s.totalVanna,
        totalCharm: s.totalCharm,
      },
      spot
    );
    if (isDev) console.log("[OptionsEngine] refresh success");
  } catch (e) {
    console.log("[OptionsEngine] refresh failed:", e instanceof Error ? e.message : "unknown");
  }
}

export function startOptionsRefreshInterval(): void {
  if (refreshTimer) return;
  refreshTimer = setInterval(refreshOptionsEngine, REFRESH_INTERVAL_MS);
  console.log(
    `[OptionsEngine] refresh scheduler started (every ${Math.round(REFRESH_INTERVAL_MS / 1000)}s)`,
  );
  setTimeout(() => refreshOptionsEngine(), 10000); // First refresh 10 sec after startup
}

export function stopOptionsRefreshInterval(): void {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
}
