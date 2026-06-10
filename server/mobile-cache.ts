/**
 * Mobile State Cache - Server-side caching for mobile endpoint
 * Recalculates state every 2 seconds, serves cached snapshots
 */

import { getTerminalState } from "./terminal-state";
import { adaptTerminalStateForMobileOptimized, OptimizedMobileTerminalState } from "./mobile-adapter-optimized";
import { envInt, isProduction } from "./lib/runtimeEnv";

const MOBILE_CACHE_REFRESH_MS = envInt(
  "MOBILE_CACHE_REFRESH_MS",
  isProduction ? 10_000 : 2_000,
);

interface CachedMobileState {
  data: OptimizedMobileTerminalState;
  timestamp: number;
  buildTime: number;
}

let cachedState: CachedMobileState | null = null;
let cacheTimer: NodeJS.Timeout | null = null;
let isBuilding = false;

// Performance metrics
let totalBuilds = 0;
let totalBuildTime = 0;
let totalRequests = 0;

/**
 * Build fresh mobile state (expensive operation)
 */
async function buildMobileState(): Promise<CachedMobileState> {
  const startTime = Date.now();
  isBuilding = true;
  
  try {
    const terminalState = await getTerminalState();
    const mobileState = await adaptTerminalStateForMobileOptimized(terminalState);
    
    const buildTime = Date.now() - startTime;
    totalBuilds++;
    totalBuildTime += buildTime;
    if (!isProduction) {
      console.log(`[CACHE] State built in ${buildTime}ms (avg: ${(totalBuildTime/totalBuilds).toFixed(1)}ms)`);
    }
    return {
      data: mobileState,
      timestamp: Date.now(),
      buildTime
    };
  } finally {
    isBuilding = false;
  }
}

/**
 * Start background cache refresh every 2 seconds
 */
export function startMobileCache(): void {
  console.log(`[CACHE] Starting mobile state cache (${MOBILE_CACHE_REFRESH_MS}ms refresh)`);
  
  // Initial build
  buildMobileState().then(state => {
    cachedState = state;
    console.log("[CACHE] Initial cache populated");
  });
  
  // Refresh every 2 seconds
  cacheTimer = setInterval(async () => {
    if (!isBuilding) {
      try {
        cachedState = await buildMobileState();
      } catch (error) {
        console.error("[CACHE] Failed to refresh cache:", error);
      }
    }
  }, MOBILE_CACHE_REFRESH_MS);
}

/**
 * Stop background cache refresh
 */
export function stopMobileCache(): void {
  if (cacheTimer) {
    clearInterval(cacheTimer);
    cacheTimer = null;
    console.log("[CACHE] Mobile state cache stopped");
  }
}

/**
 * Get cached mobile state (fast operation)
 */
export function getCachedMobileState(): CachedMobileState | null {
  totalRequests++;
  return cachedState;
}

/**
 * Get performance metrics
 */
export function getCacheMetrics() {
  return {
    totalBuilds,
    totalBuildTime,
    avgBuildTime: totalBuilds > 0 ? totalBuildTime / totalBuilds : 0,
    totalRequests,
    cacheAge: cachedState ? Date.now() - cachedState.timestamp : 0,
    lastBuildTime: cachedState?.buildTime || 0
  };
}

/**
 * Force cache refresh (for testing)
 */
export async function refreshCache(): Promise<void> {
  console.log("[CACHE] Manual cache refresh requested");
  cachedState = await buildMobileState();
}
