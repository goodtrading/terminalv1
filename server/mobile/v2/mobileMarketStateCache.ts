import type { TerminalState } from "../../terminal-state";
import { buildCanonicalMobileState } from "./buildCanonicalMobileState";
import type { CanonicalMobileSnapshot, SupportedAsset } from "./mobileMarketStateV2.types";
import { MOBILE_V2_CACHE_TTL_MS } from "./mobileMarketStateV2.types";

let cachedSnapshot: CanonicalMobileSnapshot | null = null;
let cachedExpiresAt = 0;
let inFlightBuild: Promise<CanonicalMobileSnapshot> | null = null;
let terminalStateLoader: (() => Promise<TerminalState>) | null = null;
let loaderCallCount = 0;

async function defaultTerminalStateLoader(): Promise<TerminalState> {
  const { getTerminalState } = await import("../../terminal-state");
  return getTerminalState();
}

async function loadTerminalState(): Promise<TerminalState> {
  loaderCallCount += 1;
  const loader = terminalStateLoader ?? defaultTerminalStateLoader;
  return loader();
}

export type CacheMetrics = {
  cacheHit: boolean;
  buildTimeMs: number;
  snapshotId: string;
};

/** Test seam — inject terminal state without running full engines. */
export function __setMobileV2TerminalStateLoaderForTests(
  loader: (() => Promise<TerminalState>) | null,
): void {
  terminalStateLoader = loader;
}

/** Test helper — clear cached snapshot and counters. */
export function __resetMobileV2CacheForTests(): void {
  cachedSnapshot = null;
  cachedExpiresAt = 0;
  inFlightBuild = null;
  loaderCallCount = 0;
}

export function __getMobileV2LoaderCallCountForTests(): number {
  return loaderCallCount;
}

/** Force cache expiry for tests without clearing snapshot memory. */
export function __expireMobileV2CacheForTests(): void {
  cachedExpiresAt = 0;
}

function withCacheHit(snapshot: CanonicalMobileSnapshot): CanonicalMobileSnapshot {
  return {
    ...snapshot,
    metadata: {
      ...snapshot.metadata,
      cacheHit: true,
    },
  };
}

async function buildSnapshot(asset: SupportedAsset): Promise<CanonicalMobileSnapshot> {
  const start = Date.now();
  const ts = await loadTerminalState();
  return buildCanonicalMobileState(ts, asset, false, Date.now() - start);
}

export async function getCanonicalMobileSnapshot(
  asset: SupportedAsset,
): Promise<{ snapshot: CanonicalMobileSnapshot; metrics: CacheMetrics }> {
  const now = Date.now();
  const cacheValid =
    cachedSnapshot != null &&
    cachedExpiresAt > now &&
    cachedSnapshot.metadata.asset === asset;

  if (cacheValid && cachedSnapshot) {
    const snapshot = withCacheHit(cachedSnapshot);
    return {
      snapshot,
      metrics: {
        cacheHit: true,
        buildTimeMs: snapshot.metadata.buildTimeMs,
        snapshotId: snapshot.metadata.snapshotId,
      },
    };
  }

  if (!inFlightBuild) {
    inFlightBuild = buildSnapshot(asset)
      .then((snapshot) => {
        cachedSnapshot = snapshot;
        cachedExpiresAt = Date.now() + MOBILE_V2_CACHE_TTL_MS;
        return snapshot;
      })
      .finally(() => {
        inFlightBuild = null;
      });
  }

  const snapshot = await inFlightBuild;
  return {
    snapshot: {
      ...snapshot,
      metadata: {
        ...snapshot.metadata,
        cacheHit: false,
      },
    },
    metrics: {
      cacheHit: false,
      buildTimeMs: snapshot.metadata.buildTimeMs,
      snapshotId: snapshot.metadata.snapshotId,
    },
  };
}

export function startMobileV2CacheWarmup(): void {
  void getCanonicalMobileSnapshot("BTC").catch((err) => {
    console.warn("[MobileV2Cache] warmup failed:", err instanceof Error ? err.message : err);
  });
}
