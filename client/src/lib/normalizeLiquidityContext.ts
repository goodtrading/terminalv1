/**
 * Phase 4 — defensive extraction of liquidity/orderflow context from terminal state.
 * Read-only; no new backend logic.
 */

import type { TerminalState } from "@/hooks/useTerminalState";
import type {
  LiquidityContextInput,
  LiquidityWall,
  LiquidityVoid,
  SweepContext,
  CascadeContext,
  AbsorptionContext,
} from "@/lib/volatilityEngine";

export type NormalizedLiquidityResult = LiquidityContextInput & {
  liquidityIntegrated: boolean;
};

function num(v: unknown): number | undefined {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : undefined;
}

function pctDistance(price: number, spot: number): number | undefined {
  if (!Number.isFinite(price) || !Number.isFinite(spot) || spot <= 0) return undefined;
  return (Math.abs(price - spot) / spot) * 100;
}

function wallStrength(
  qty: number,
  intensity: number,
): LiquidityWall["strength"] {
  const score = qty * 0.001 + intensity * 0.4;
  if (score >= 80) return "EXTREME";
  if (score >= 45) return "HIGH";
  if (score >= 20) return "MEDIUM";
  return "LOW";
}

function mapHeatmapPressure(raw: unknown): LiquidityContextInput["heatmapPressure"] {
  const s = String(raw ?? "").toUpperCase();
  if (s.includes("BID") && s.includes("HEAVY")) return "UPSIDE";
  if (s.includes("ASK") && s.includes("HEAVY")) return "DOWNSIDE";
  if (s === "UPSIDE" || s === "UP") return "UPSIDE";
  if (s === "DOWNSIDE" || s === "DOWN") return "DOWNSIDE";
  if (s.includes("TWO") || s === "BALANCED") return s.includes("TWO") ? "TWO_SIDED" : "NEUTRAL";
  if (s === "NEUTRAL") return "NEUTRAL";
  return "UNKNOWN";
}

function extractWalls(zones: unknown[], spot?: number): LiquidityWall[] {
  if (!Array.isArray(zones)) return [];
  const walls: LiquidityWall[] = [];
  for (const z of zones) {
    if (!z || typeof z !== "object") continue;
    const o = z as Record<string, unknown>;
    const start = num(o.priceStart);
    const end = num(o.priceEnd) ?? start;
    if (start == null) continue;
    const mid = end != null ? (start + end) / 2 : start;
    const qty = num(o.totalQuantity) ?? num(o.size) ?? 0;
    const intensity = num(o.intensity) ?? 0;
    if (qty < 15 && intensity < 25) continue;
    const sideRaw = String(o.side ?? "").toUpperCase();
    const side: LiquidityWall["side"] =
      sideRaw === "BID" || sideRaw === "ASK" ? sideRaw : undefined;
    walls.push({
      price: mid,
      size: qty,
      side,
      strength: wallStrength(qty, intensity),
      distancePct: spot != null ? pctDistance(mid, spot) : undefined,
    });
  }
  walls.sort((a, b) => (a.distancePct ?? 999) - (b.distancePct ?? 999));
  return walls.slice(0, 4);
}

function extractVoids(
  heatmap: Record<string, unknown> | undefined,
  positioning: Record<string, unknown> | undefined,
): LiquidityVoid[] {
  const voids: LiquidityVoid[] = [];
  const vacuum = heatmap?.liquidityVacuum as Record<string, unknown> | undefined;
  const active = vacuum?.activeZones;
  if (Array.isArray(active)) {
    for (const z of active) {
      if (!z || typeof z !== "object") continue;
      const o = z as Record<string, unknown>;
      const low = num(o.priceStart);
      const high = num(o.priceEnd) ?? low;
      if (low == null) continue;
      const dir = String(o.direction ?? "").toUpperCase();
      voids.push({
        low,
        high: high ?? low,
        direction: dir === "UP" || dir === "DOWN" ? dir : "BOTH",
        intensity: num(o.strength) ?? undefined,
      });
    }
  }
  const thin = num(vacuum?.nearestThinLiquidityZone);
  const thinDir = String(vacuum?.nearestThinLiquidityDirection ?? "").toUpperCase();
  if (thin != null) {
    const pad = thin * 0.0008;
    voids.push({
      low: thin - pad,
      high: thin + pad,
      direction: thinDir === "UP" || thinDir === "DOWN" ? thinDir : "BOTH",
      intensity: num(vacuum?.nearestThinLiquidityScore),
    });
  }
  const posVac = positioning?.liquidityVacuum ?? positioning?.vacuumZones;
  if (Array.isArray(posVac)) {
    for (const z of posVac) {
      if (!z || typeof z !== "object") continue;
      const o = z as Record<string, unknown>;
      const low = num(o.low ?? o.priceStart);
      const high = num(o.high ?? o.priceEnd) ?? low;
      if (low == null) continue;
      voids.push({
        low,
        high: high ?? low,
        direction: undefined,
        intensity: num(o.intensity ?? o.score),
      });
    }
  }
  return voids.slice(0, 3);
}

function parseSweep(raw: unknown): SweepContext | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  const status = String(o.status ?? o.sweepStatus ?? "").toUpperCase();
  const validStatus = ["IDLE", "SETUP", "TRIGGERED", "IN_PROGRESS", "RESOLVED"];
  const direction = String(o.direction ?? o.sweepDirection ?? "NONE").toUpperCase();
  const conf = num(o.confidence);
  const trigger = o.sweepTrigger ?? o.trigger;
  let level: number | undefined;
  if (typeof trigger === "number") level = trigger;
  else if (typeof trigger === "string") {
    const m = trigger.match(/[\d,]+(?:\.\d+)?/);
    if (m) level = Number(m[0].replace(/,/g, ""));
  }
  return {
    status: validStatus.includes(status) ? (status as SweepContext["status"]) : undefined,
    direction: ["UP", "DOWN", "TWO_SIDED", "NONE"].includes(direction)
      ? (direction as SweepContext["direction"])
      : undefined,
    type: String(o.type ?? o.sweepType ?? "") || undefined,
    confidence: conf,
    level: Number.isFinite(level) ? level : undefined,
  };
}

function parseCascade(raw: unknown): CascadeContext | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  const risk = String(o.cascadeRisk ?? o.risk ?? "").toUpperCase();
  const dir = String(o.cascadeDirection ?? o.direction ?? "NONE").toUpperCase();
  const watch = num(o.cascadeWatchLevel);
  const triggerStr = String(o.cascadeTrigger ?? o.trigger ?? "");
  let triggerLevel: number | undefined = watch;
  if (triggerLevel == null && triggerStr) {
    const m = triggerStr.match(/[\d,]+(?:\.\d+)?/);
    if (m) triggerLevel = Number(m[0].replace(/,/g, ""));
  }
  return {
    risk: ["LOW", "MEDIUM", "HIGH", "EXTREME"].includes(risk)
      ? (risk as CascadeContext["risk"])
      : undefined,
    direction: ["UP", "DOWN", "TWO_SIDED", "NONE"].includes(dir)
      ? (dir as CascadeContext["direction"])
      : undefined,
    triggerLevel,
    targetZone: watch,
  };
}

function parseAbsorption(raw: unknown): AbsorptionContext | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  const status = String(o.status ?? "").toUpperCase();
  const detected =
    status === "ACTIVE" || status === "CONFIRMED" || status === "SETUP";
  const sideRaw = String(o.side ?? o.candidateSide ?? "NONE").toUpperCase();
  let side: AbsorptionContext["side"] = "NONE";
  if (sideRaw.includes("BUY") || sideRaw === "BID") side = "BID";
  else if (sideRaw.includes("SELL") || sideRaw === "ASK") side = "ASK";
  else if (sideRaw.includes("BOTH")) side = "BOTH";
  const ref = num(o.referencePrice ?? o.candidateReferencePrice);
  const zoneLow = num(o.zoneLow ?? o.candidateZoneLow);
  const level = ref ?? (zoneLow != null ? zoneLow : undefined);
  const intensity = num(o.intensity);
  let strength: AbsorptionContext["strength"] = "LOW";
  if (intensity != null) {
    if (intensity >= 75) strength = "EXTREME";
    else if (intensity >= 55) strength = "HIGH";
    else if (intensity >= 35) strength = "MEDIUM";
  }
  return { detected, side, level, strength };
}

function pickNearestVoid(voids: LiquidityVoid[], spot?: number): LiquidityVoid | undefined {
  if (!voids.length) return undefined;
  if (spot == null) return voids[0];
  let best = voids[0];
  let bestDist = Infinity;
  for (const v of voids) {
    const mid = (v.low + v.high) / 2;
    const d = Math.abs(mid - spot);
    if (d < bestDist) {
      bestDist = d;
      best = v;
    }
  }
  return best;
}

/** Extract summarized liquidity context from `/api/terminal/state`. */
export function normalizeLiquidityContext(
  terminal: TerminalState | undefined,
  spot?: number,
): NormalizedLiquidityResult {
  const empty: NormalizedLiquidityResult = {
    liquidityIntegrated: false,
    heatmapPressure: "UNKNOWN",
  };

  if (!terminal) return empty;

  const positioning = terminal.positioning as Record<string, unknown> | undefined;
  const gravity = terminal.gravityMap as Record<string, unknown> | undefined;
  const heatmap = (positioning?.liquidityHeatmap ?? positioning?.heatmap) as
    | Record<string, unknown>
    | undefined;

  const zones =
    heatmap?.liquidityHeatZones ??
    heatmap?.heatZones ??
    positioning?.liquidityHeatZones;
  const walls = extractWalls(Array.isArray(zones) ? zones : [], spot);

  const summary = heatmap?.heatmapSummary as Record<string, unknown> | undefined;
  if (walls.length < 2 && summary) {
    const bidZ = num(summary.strongestBidZone);
    const askZ = num(summary.strongestAskZone);
    const bidQty = num(summary.totalBidLiquidity) ?? 0;
    const askQty = num(summary.totalAskLiquidity) ?? 0;
    if (bidZ != null && bidQty > 0) {
      walls.push({
        price: bidZ,
        size: bidQty,
        side: "BID",
        strength: wallStrength(bidQty, 50),
        distancePct: spot != null ? pctDistance(bidZ, spot) : undefined,
      });
    }
    if (askZ != null && askQty > 0) {
      walls.push({
        price: askZ,
        size: askQty,
        side: "ASK",
        strength: wallStrength(askQty, 50),
        distancePct: spot != null ? pctDistance(askZ, spot) : undefined,
      });
    }
    walls.sort((a, b) => (a.distancePct ?? 999) - (b.distancePct ?? 999));
  }

  const voids = extractVoids(heatmap, positioning);
  const sweep = parseSweep(
    positioning?.liquiditySweepDetector ?? positioning?.sweep ?? positioning?.sweepState,
  );
  const cascade = parseCascade(
    positioning?.liquidityCascadeEngine ?? positioning?.cascade,
  );
  const absorption = parseAbsorption(positioning?.absorption ?? positioning?.absorptionState);

  const primaryMagnet = gravity?.primaryMagnet;
  const magnet =
    (primaryMagnet && typeof primaryMagnet === "object"
      ? num((primaryMagnet as Record<string, unknown>).price)
      : num(primaryMagnet)) ??
    num(heatmap?.activeMagnet) ??
    num(positioning?.activeMagnet);

  const pressureRaw =
    heatmap?.liquidityPressure ??
    heatmap?.pressure ??
    heatmap?.heatmapPressure ??
    positioning?.liquidityPressure;
  const heatmapPressure = mapHeatmapPressure(pressureRaw);

  const nearestWall =
    walls.find((w) => w.distancePct != null && w.distancePct < 1.5) ?? walls[0];
  const nearestVoid = pickNearestVoid(voids, spot);

  const hasSignal =
    walls.length > 0 ||
    voids.length > 0 ||
    magnet != null ||
    sweep?.status != null ||
    cascade?.risk != null ||
    absorption?.detected === true ||
    heatmapPressure !== "UNKNOWN";

  if (!hasSignal) return empty;

  return {
    liquidityIntegrated: true,
    majorWalls: walls.length ? walls : undefined,
    nearestWall,
    activeMagnet: magnet,
    liquidityVoids: voids.length ? voids : undefined,
    nearestVoid,
    heatmapPressure,
    sweep,
    cascade,
    absorption,
  };
}

export function hasLiquidityTerminalData(terminal: TerminalState | undefined): boolean {
  return normalizeLiquidityContext(terminal).liquidityIntegrated;
}
