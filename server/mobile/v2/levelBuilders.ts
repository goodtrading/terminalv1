import type {
  ContextTag,
  DataStatus,
  DominantExpiryBlock,
  LevelRef,
} from "./mobileMarketStateV2.types";
import { computeDistance, parseDominantExpiry } from "./mobileMarketStateQuality";

export function buildPriceLevelRef(input: {
  id: string;
  type: string;
  price: number | null | undefined;
  spot: number | null | undefined;
  context: ContextTag;
  source: string;
  strength?: number | null;
}): LevelRef | null {
  if (input.price == null || !Number.isFinite(input.price) || input.price <= 0) {
    return null;
  }
  return {
    id: input.id,
    type: input.type,
    price: input.price,
    lower: null,
    upper: null,
    strength:
      input.strength != null && Number.isFinite(input.strength) ? input.strength : null,
    distance: computeDistance(input.price, input.spot),
    context: input.context,
    source: input.source,
    status: "available",
  };
}

export function buildRangeLevelRef(input: {
  id: string;
  type: string;
  lower: number | null | undefined;
  upper: number | null | undefined;
  spot: number | null | undefined;
  context: ContextTag;
  source: string;
  strength?: number | null;
}): LevelRef | null {
  if (
    input.lower == null ||
    input.upper == null ||
    !Number.isFinite(input.lower) ||
    !Number.isFinite(input.upper)
  ) {
    return null;
  }
  const mid = (input.lower + input.upper) / 2;
  return {
    id: input.id,
    type: input.type,
    price: mid,
    lower: input.lower,
    upper: input.upper,
    strength:
      input.strength != null && Number.isFinite(input.strength) ? input.strength : null,
    distance: computeDistance(mid, input.spot),
    context: input.context,
    source: input.source,
    status: "available",
  };
}

export function filterMagnetsNearSpot(
  magnets: number[] | null | undefined,
  spot: number | null,
  maxPct = 7,
): number[] {
  if (!magnets?.length || spot == null || !Number.isFinite(spot) || spot <= 0) return [];
  return magnets.filter((m) => {
    if (!Number.isFinite(m)) return false;
    const pct = Math.abs(((m - spot) / spot) * 100);
    return pct <= maxPct;
  });
}

export function emptyLevels(status: DataStatus = "unavailable"): {
  items: LevelRef[];
  status: DataStatus;
} {
  return { items: [], status };
}

export function levelsFromMagnets(
  magnets: number[],
  spot: number | null,
  context: ContextTag,
  source: string,
): { items: LevelRef[]; status: DataStatus } {
  if (!magnets.length) return emptyLevels("unavailable");
  const items = magnets
    .map((price, idx) =>
      buildPriceLevelRef({
        id: `${context}-magnet-${idx}`,
        type: "gamma_magnet",
        price,
        spot,
        context,
        source,
      }),
    )
    .filter((x): x is LevelRef => x != null);
  return { items, status: items.length ? "available" : "unavailable" };
}

export function pocketsFromStructured(
  pockets:
    | Array<{
        id: string;
        rangeLow: number;
        rangeHigh: number;
        confidence?: number;
      }>
    | undefined,
  spot: number | null,
  context: ContextTag,
  source: string,
): { items: LevelRef[]; status: DataStatus } {
  if (!pockets?.length) return emptyLevels("unavailable");
  const items = pockets
    .map((p) =>
      buildRangeLevelRef({
        id: p.id,
        type: "short_gamma_pocket",
        lower: p.rangeLow,
        upper: p.rangeHigh,
        spot,
        context,
        source,
        strength: p.confidence ?? null,
      }),
    )
    .filter((x): x is LevelRef => x != null);
  return { items, status: items.length ? "available" : "unavailable" };
}

export function pocketsFromLegacyRange(
  start: number | null | undefined,
  end: number | null | undefined,
  spot: number | null,
  context: ContextTag,
  source: string,
): { items: LevelRef[]; status: DataStatus } {
  const item = buildRangeLevelRef({
    id: `${context}-legacy-pocket`,
    type: "short_gamma_pocket",
    lower: start,
    upper: end,
    spot,
    context,
    source,
  });
  if (!item) return emptyLevels("unavailable");
  return { items: [item], status: "available" };
}

export function mergePocketSources(
  structured: { items: LevelRef[]; status: DataStatus },
  legacy: { items: LevelRef[]; status: DataStatus },
): { items: LevelRef[]; status: DataStatus } {
  if (structured.items.length) return structured;
  if (legacy.items.length) return legacy;
  return emptyLevels("unavailable");
}

export function buildDominantExpiry(
  raw: string | null | undefined,
  applicable: boolean,
  now?: Date,
): DominantExpiryBlock {
  return parseDominantExpiry(raw, applicable, now);
}
