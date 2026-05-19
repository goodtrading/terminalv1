/** Institutional heatmap — major walls only (>= 100 BTC) */

export const HEATMAP_MAJOR_WALL_BTC = 100;
export const HEATMAP_MAJOR_WALL_MIN_OPACITY = 0.65;
export const HEATMAP_MAJOR_WALL_LABEL_MIN_BTC = 100;

export type HeatmapLevelLike = {
  price?: number;
  side?: string;
  size?: number;
  sizeBtc?: number;
  btcSize?: number;
  quantity?: number;
  qty?: number;
  amount?: number;
  notionalUsd?: number;
  notional?: number;
  usdSize?: number;
};

export type MajorWallLevel = {
  price: number;
  sizeBtc: number;
  side: "bid" | "ask";
};

export function getLevelSizeBtc(level: HeatmapLevelLike, spot?: number): number {
  const candidates = [
    level.sizeBtc,
    level.btcSize,
    level.quantity,
    level.qty,
    level.size,
    level.amount,
  ];

  for (const value of candidates) {
    const n = Number(value);
    if (Number.isFinite(n) && n > 0) return n;
  }

  const notionalCandidates = [level.notionalUsd, level.notional, level.usdSize];
  const px = Number(level.price) || Number(spot);

  for (const value of notionalCandidates) {
    const n = Number(value);
    if (Number.isFinite(n) && n > 0 && Number.isFinite(px) && px > 0) {
      return n / px;
    }
  }

  return 0;
}

export function isMajorHeatmapWall(sizeBtc: number): boolean {
  return Number.isFinite(sizeBtc) && sizeBtc >= HEATMAP_MAJOR_WALL_BTC;
}

export function normalizeHeatmapSide(side: unknown): "bid" | "ask" | null {
  const s = String(side ?? "").toLowerCase();
  if (s === "bid" || s === "buy") return "bid";
  if (s === "ask" || s === "sell") return "ask";
  return null;
}

export function normalizeHeatmapLevel(
  level: unknown,
  spot?: number,
  side?: "bid" | "ask",
): { price: number; size: number; side: "bid" | "ask" } | null {
  if (Array.isArray(level) && level.length >= 2) {
    const price = parseFloat(String(level[0]));
    const size = parseFloat(String(level[1]));
    if (!Number.isFinite(price) || !Number.isFinite(size) || size <= 0 || !side) return null;
    if (size < HEATMAP_MAJOR_WALL_BTC) return null;
    return { price, size, side };
  }
  if (level && typeof level === "object") {
    const o = level as HeatmapLevelLike;
    const price = Number(o.price);
    const sizeBtc = getLevelSizeBtc(o, spot);
    const resolvedSide = normalizeHeatmapSide(o.side) ?? side;
    if (!Number.isFinite(price) || price <= 0 || !resolvedSide) return null;
    if (sizeBtc < HEATMAP_MAJOR_WALL_BTC) return null;
    return { price, size: sizeBtc, side: resolvedSide };
  }
  return null;
}

/** Same price + side → keep largest size only. */
export function dedupeMajorWallsByExactPrice(walls: MajorWallLevel[]): MajorWallLevel[] {
  const byKey = new Map<string, MajorWallLevel>();
  for (const w of walls) {
    const key = `${w.side}_${w.price}`;
    const prev = byKey.get(key);
    if (!prev || w.sizeBtc > prev.sizeBtc) byKey.set(key, w);
  }
  return Array.from(byKey.values());
}

/** Strict filter: only current book levels with sizeBtc >= 100 BTC. No clustering. */
export function extractMajorWallsFromOrderBook(
  bids: unknown[],
  asks: unknown[],
  spot?: number,
): MajorWallLevel[] {
  const majorWalls: MajorWallLevel[] = [];

  for (const level of bids) {
    const n = normalizeHeatmapLevel(level, spot, "bid");
    if (n) majorWalls.push({ price: n.price, sizeBtc: n.size, side: "bid" });
  }
  for (const level of asks) {
    const n = normalizeHeatmapLevel(level, spot, "ask");
    if (n) majorWalls.push({ price: n.price, sizeBtc: n.size, side: "ask" });
  }

  return dedupeMajorWallsByExactPrice(majorWalls);
}

let lastHeatmapMajorLogMs = 0;

export function logHeatmapMajorWallsOnly(
  receivedLevels: number,
  majorWalls: MajorWallLevel[],
  throttleMs = 5000,
): void {
  if (typeof import.meta !== "undefined" && !import.meta.env?.DEV) return;
  if (typeof process !== "undefined" && process.env?.NODE_ENV === "production") return;

  const now = Date.now();
  if (now - lastHeatmapMajorLogMs < throttleMs) return;
  lastHeatmapMajorLogMs = now;

  console.debug("[HEATMAP_MAJOR_WALLS_ONLY]", {
    receivedLevels,
    majorWalls: majorWalls.length,
    bids: majorWalls.filter((l) => l.side === "bid").length,
    asks: majorWalls.filter((l) => l.side === "ask").length,
    sample: majorWalls.slice(0, 10).map((l) => ({
      price: l.price,
      side: l.side,
      sizeBtc: l.sizeBtc,
    })),
  });
}

/** Bookmap tracker: keep all major walls in depth snapshot + near-touch minors. */
export function selectOrderBookLevelsForHeatmap<T extends { size: number }>(
  levels: T[],
  maxLevels: number,
  majorBtc: number = HEATMAP_MAJOR_WALL_BTC,
): T[] {
  const major = levels.filter((l) => l.size >= majorBtc);
  const minor = levels.filter((l) => l.size < majorBtc);
  const minorCap = Math.max(0, maxLevels - major.length);
  return [...major, ...minor.slice(0, minorCap)];
}
