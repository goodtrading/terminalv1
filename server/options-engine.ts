/**
 * Options Engine Refresh Scheduler
 * Refreshes Gamma Flip, Call Wall, Put Wall, Total GEX from Deribit every 3 minutes.
 * Preserves last valid state on failure.
 */
import { storage } from "./storage";
import { DeribitOptionsGateway } from "./deribit-gateway";
import { MarketDataGateway } from "./market-gateway";

const REFRESH_INTERVAL_MS = 3 * 60 * 1000; // 3 minutes

let refreshTimer: ReturnType<typeof setInterval> | null = null;

export async function refreshOptionsEngine(): Promise<void> {
  try {
    const { options, source } = await DeribitOptionsGateway.ingestOptions();
    const spotPrice = MarketDataGateway.getCachedTicker()?.price ?? 68250;

    if (options.length === 0) {
      console.log("[OptionsEngine] No options data, keeping last state");
      return;
    }

    const summary = await DeribitOptionsGateway.getSummary(options, spotPrice, source);

    const totalGex = summary.totalGex ?? 0;
    const gammaFlip = summary.gammaFlip ?? 0;
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

    if (gammaFlip > 0 || totalGex !== 0 || callWall > 0 || putWall > 0) {
      const pockets = s.shortGammaPockets ?? [];
      const shortGammaZones = pockets.map((z: { start: number; end: number }) => ({
        startStrike: z.start,
        endStrike: z.end,
      }));
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
        },
        spotPrice
      );
      console.log("[OptionsEngine] refresh success");
    } else {
      console.log("[OptionsEngine] No valid gamma levels, keeping last state");
    }
  } catch (e) {
    console.log("[OptionsEngine] refresh failed:", e instanceof Error ? e.message : "unknown");
  }
}

export function startOptionsRefreshInterval(): void {
  if (refreshTimer) return;
  refreshTimer = setInterval(refreshOptionsEngine, REFRESH_INTERVAL_MS);
  console.log("[OptionsEngine] refresh scheduler started (every 3 min)");
  setTimeout(() => refreshOptionsEngine(), 10000); // First refresh 10 sec after startup
}

export function stopOptionsRefreshInterval(): void {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
}
