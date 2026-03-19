import { MarketDataGateway } from "../market-gateway";
import { storage } from "../storage";

let cache: { ts: number; context: any } | null = null;

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function maybeNumber(v: unknown) {
  return isFiniteNumber(v) ? v : undefined;
}

/**
 * Builds a compact “institutional context” object for the AI analyst.
 * Uses a very short TTL to avoid extra work per chat request.
 * IMPORTANT: This function intentionally does NOT call `getTerminalState()`
 * (that would run heavy engines + logging). We only use lightweight in-memory
 * storage getters + the cached ticker.
 */
export async function buildLiveMarketContext(): Promise<Record<string, unknown>> {
  const now = Date.now();
  if (cache && now - cache.ts < 1500) return cache.context;

  const ticker = MarketDataGateway.getCachedTicker();
  const spot = maybeNumber(ticker?.price);

  const [market, exposure, positioning, levels] = await Promise.all([
    storage.getMarketState(),
    storage.getDealerExposure(),
    storage.getOptionsPositioning(),
    storage.getKeyLevels(),
  ]);

  const ctx: Record<string, unknown> = {};
  if (spot != null) ctx.spot = spot;

  if (market) {
    if (typeof market.gammaFlip === "number" && Number.isFinite(market.gammaFlip)) ctx.gammaFlip = market.gammaFlip;
    if (typeof market.gammaRegime === "string") ctx.gammaState = market.gammaRegime;
  }

  if (positioning) {
    if (typeof positioning.callWall === "number" && Number.isFinite(positioning.callWall)) ctx.callWall = positioning.callWall;
    if (typeof positioning.putWall === "number" && Number.isFinite(positioning.putWall)) ctx.putWall = positioning.putWall;

    const anyPos = positioning as any;
    const activeCallWall = maybeNumber(anyPos.activeCallWall);
    const activePutWall = maybeNumber(anyPos.activePutWall);
    if (activeCallWall != null) ctx.activeCallWall = activeCallWall;
    if (activePutWall != null) ctx.activePutWall = activePutWall;

    // Optional compact pressure/sweep/absorption if present (often not in storage).
    const sweep = anyPos.liquiditySweepDetector ?? anyPos.latestSweep;
    if (sweep && typeof sweep === "object") {
      const s = sweep as any;
      const compactSweep: Record<string, unknown> = {};
      if (typeof s.sweepRisk === "string") compactSweep.sweepRisk = s.sweepRisk;
      if (typeof s.sweepDirection === "string") compactSweep.sweepDirection = s.sweepDirection;
      if (typeof s.sweepTrigger === "string") compactSweep.sweepTrigger = s.sweepTrigger;
      if (typeof s.sweepTargetZone === "string" || typeof s.sweepTargetZone === "number") compactSweep.sweepTargetZone = s.sweepTargetZone;
      if (Object.keys(compactSweep).length > 0) ctx.latestSweep = compactSweep;
    }

    const absorption = anyPos.absorption;
    if (absorption && typeof absorption === "object") {
      const a = absorption as any;
      const compactAbs: Record<string, unknown> = {};
      if (typeof a.status === "string") compactAbs.status = a.status;
      if (typeof a.side === "string") compactAbs.side = a.side;
      if (typeof a.confidence === "number" && Number.isFinite(a.confidence)) compactAbs.confidence = a.confidence;
      if (typeof a.intensity === "number" && Number.isFinite(a.intensity)) compactAbs.intensity = a.intensity;
      if (typeof a.zoneLow === "number" && Number.isFinite(a.zoneLow)) compactAbs.zoneLow = a.zoneLow;
      if (typeof a.zoneHigh === "number" && Number.isFinite(a.zoneHigh)) compactAbs.zoneHigh = a.zoneHigh;
      if (typeof a.trigger === "string") compactAbs.trigger = a.trigger;
      if (typeof a.invalidation === "string") compactAbs.invalidation = a.invalidation;
      if (Array.isArray(a.summary)) compactAbs.summary = a.summary.slice(0, 2);
      if (Object.keys(compactAbs).length > 0) ctx.absorptionState = compactAbs;

      const pressureState =
        typeof a.pressureState === "string"
          ? a.pressureState
          : typeof a.pressure === "string"
            ? a.pressure
            : undefined;
      if (pressureState && pressureState.trim().length > 0) ctx.pressureState = pressureState;
    }
  }

  if (exposure) {
    const vanna = maybeNumber(exposure.vannaExposure);
    const charm = maybeNumber(exposure.charmExposure);
    if (vanna != null) ctx.vannaExposure = vanna;
    if (charm != null) ctx.charmExposure = charm;
  }

  if (levels) {
    const gammaMagnets = Array.isArray(levels.gammaMagnets) ? levels.gammaMagnets : [];
    const top3 = gammaMagnets.slice(0, 3);
    const shortPocketStart = maybeNumber((levels as any).shortGammaPocketStart);
    const shortPocketEnd = maybeNumber((levels as any).shortGammaPocketEnd);

    const liquidityLevels: Record<string, unknown> = {};
    if (top3.length > 0) liquidityLevels.top3GammaMagnets = top3;
    if (shortPocketStart != null) liquidityLevels.shortGammaPocketStart = shortPocketStart;
    if (shortPocketEnd != null) liquidityLevels.shortGammaPocketEnd = shortPocketEnd;

    if (Object.keys(liquidityLevels).length > 0) ctx.liquidityLevels = liquidityLevels;
  }

  cache = { ts: now, context: ctx };
  return ctx;
}

