import type { VerticalCompressionMode } from "@/lib/bookmapDepthRange";
import {
  WALL_IMPORTANT_BTC,
  WALL_MAJOR_BTC,
  WALL_STRUCTURAL_BTC,
} from "@/lib/bookmapEngineConfig";
import type { BookLevel, BookmapState, HeatmapCell } from "@/types/bookmapState";
import { bucketPrice } from "./domLadderUtils";
import type { LiveDomBookLevel } from "./bookmapLiveDomPriority";
import {
  getLiquidityLifecycleCache,
  materializeLifecycleHistoricalCells,
} from "./bookmapLiquidityLifecycle";

const RESTING_LIQUIDITY_SAMPLER_MS = 1_200;

export type RestingLiquidityRenderSlice = {
  liveProjectionLevels?: Array<{ side: "bid" | "ask"; price: number }>;
  activeDomBands?: Array<{ side: "bid" | "ask"; price: number }>;
  textureCells?: Array<{
    side: "bid" | "ask";
    price: number;
    timeBucket: number;
    endTimeBucket?: number;
    intensity?: number;
    historicalRenderIntensity?: number;
    maxSizeInBucket: number;
  }>;
  bands?: Array<{ side: "bid" | "ask"; price: number }>;
};

export type RestingLiquidityWriteConfig = {
  mode: "micro" | "intraday" | "wide";
  near035MinBtc: number;
  viewportMinBtc: number;
  topPerSide: number;
  wallMinBtc: number;
  priceBucketUsd: number;
  samplerMs: number;
};

export type RestingLiquidityLifecycleState = {
  side: "bid" | "ask";
  bucketPrice: number;
  rawPrice: number;
  firstSeenAt: number;
  lastSeenAt: number;
  disappearedAt: number | null;
  previousSize: number;
  currentSize: number;
  maxSizeSeen: number;
  maxIntensitySeen: number;
  pulledRecently: boolean;
  wasActiveInPreviousSnapshot: boolean;
  isCurrentlyActiveInDom: boolean;
  writtenToHistoricalTexture: boolean;
};

export type TopDomLifecycleAuditRow = {
  side: "bid" | "ask";
  price: number;
  bucketPrice: number;
  size: number;
  activeInDom: boolean;
  inLiveProjection: boolean;
  inActiveDomBands: boolean;
  inHistoricalTexture: boolean;
  inWallBands: boolean;
  historicalCellCount: number;
  historicalMaxSize: number;
  shouldBeHistorical: boolean;
  bug: string | null;
};

export type BookmapRestingLiquidityLifecycleAudit = {
  market: string;
  sourceMode: string;
  domSource: string;
  spotPrice: number | null;
  dataEndTime: number;
  visibleEndTime: number;
  trackedPrice: number | null;
  trackedBucketPrice: number | null;
  trackedSide: "bid" | "ask" | null;
  currentDomSizeAtTrackedPrice: number;
  previousDomSizeAtTrackedPrice: number;
  sizeDeltaAtTrackedPrice: number;
  isCurrentlyActiveInDom: boolean;
  wasActiveInPreviousSnapshot: boolean;
  firstSeenAt: number | null;
  lastSeenAt: number | null;
  activeDurationMs: number;
  disappearedAt: number | null;
  pulledRecently: boolean;
  writtenToHistoricalTexture: boolean;
  historicalCellCountAtPrice: number;
  historicalSpanCountAtPrice: number;
  historicalMaxSizeAtPrice: number;
  historicalMaxIntensityAtPrice: number;
  historicalLastTimeBucketAtPrice: number | null;
  liveProjectionContainsPrice: boolean;
  activeDomBandsContainsPrice: boolean;
  wallBandsContainsPrice: boolean;
  historicalTextureContainsPrice: boolean;
  shouldBeHistoricalWall: boolean;
  shouldLeaveFootprint: boolean;
  footprintVisible: boolean;
  footprintIntensity: number;
  footprintAlpha: number;
  missingHistoricalWrite: boolean;
  liveOnlyBugDetected: boolean;
  footprintMissingBugDetected: boolean;
  lifecycleOk: boolean;
  topDomLifecycleAudit: TopDomLifecycleAuditRow[];
};

const lifecycleByKey = getLiquidityLifecycleCache();

function pctFromMid(price: number, mid: number): number {
  if (mid <= 0) return 100;
  return (Math.abs(price - mid) / mid) * 100;
}

function cellKey(timeBucket: number, side: "bid" | "ask", price: number): string {
  return `${timeBucket}:${side}:${price}`;
}

function lifecycleKey(side: "bid" | "ask", bucketPrice: number): string {
  return `${side}:${bucketPrice}`;
}

export function resolveRestingLiquidityWriteConfig(
  verticalMode?: VerticalCompressionMode,
  visiblePriceRange?: number,
): RestingLiquidityWriteConfig {
  const micro =
    verticalMode === "micro" ||
    (visiblePriceRange != null && visiblePriceRange <= 1_500);
  const intraday =
    !micro &&
    (verticalMode === "intraday" ||
      (visiblePriceRange != null && visiblePriceRange <= 6_000));

  if (micro) {
    return {
      mode: "micro",
      near035MinBtc: 2,
      viewportMinBtc: 5,
      topPerSide: 12,
      wallMinBtc: 30,
      priceBucketUsd: 5,
      samplerMs: RESTING_LIQUIDITY_SAMPLER_MS,
    };
  }
  if (intraday) {
    return {
      mode: "intraday",
      near035MinBtc: 5,
      viewportMinBtc: 10,
      topPerSide: 10,
      wallMinBtc: WALL_IMPORTANT_BTC,
      priceBucketUsd: 5,
      samplerMs: RESTING_LIQUIDITY_SAMPLER_MS,
    };
  }
  return {
    mode: "wide",
    near035MinBtc: 10,
    viewportMinBtc: 20,
    topPerSide: 8,
    wallMinBtc: WALL_IMPORTANT_BTC,
    priceBucketUsd: 5,
    samplerMs: RESTING_LIQUIDITY_SAMPLER_MS,
  };
}

export function shouldWriteRestingLiquidityToHistory(opts: {
  sizeBtc: number;
  price: number;
  midPrice: number | null;
  config: RestingLiquidityWriteConfig;
  isTopDom?: boolean;
  isStructuralWall?: boolean;
}): boolean {
  const { sizeBtc, price, midPrice, config } = opts;
  if (sizeBtc <= 0) return false;
  if (opts.isStructuralWall) return true;
  if (sizeBtc >= WALL_MAJOR_BTC || sizeBtc >= WALL_STRUCTURAL_BTC) return true;
  if (sizeBtc >= config.wallMinBtc) return true;
  if (opts.isTopDom) return true;
  if (sizeBtc >= config.viewportMinBtc) return true;
  if (midPrice != null && midPrice > 0) {
    const pct = pctFromMid(price, midPrice);
    if (pct <= 0.35 && sizeBtc >= config.near035MinBtc) return true;
  }
  return false;
}

function selectTopDomLevels(
  levels: LiveDomBookLevel[],
  side: "bid" | "ask",
  n: number,
): LiveDomBookLevel[] {
  return levels
    .filter((l) => l.side === side && l.size > 0)
    .sort((a, b) => b.size - a.size)
    .slice(0, n);
}

export function updateRestingLiquidityLifecycle(
  levels: LiveDomBookLevel[],
  now: number,
  config: RestingLiquidityWriteConfig,
  midPrice: number | null,
): void {
  materializeLifecycleHistoricalCells({
    serverCells: [],
    bookLevels: levels,
    midPrice,
    minPrice: 0,
    maxPrice: Number.MAX_SAFE_INTEGER,
    dataEndTime: now,
    config,
  });
}

export function materializeRestingLiquidityHeatmapCells(opts: {
  serverCells: HeatmapCell[];
  bookLevels: LiveDomBookLevel[];
  staleBookLevels: BookLevel[];
  midPrice: number | null;
  minPrice: number;
  maxPrice: number;
  dataEndTime: number;
  config: RestingLiquidityWriteConfig;
  verticalMode?: VerticalCompressionMode;
  bestBid?: number | null;
  bestAsk?: number | null;
  structuralWalls?: BookLevel[];
  majorWalls?: BookLevel[];
}): HeatmapCell[] {
  return materializeLifecycleHistoricalCells({
    serverCells: opts.serverCells,
    bookLevels: opts.bookLevels,
    staleBookLevels: opts.staleBookLevels,
    midPrice: opts.midPrice,
    minPrice: opts.minPrice,
    maxPrice: opts.maxPrice,
    dataEndTime: opts.dataEndTime,
    config: opts.config,
    verticalMode: opts.verticalMode,
    bestBid: opts.bestBid,
    bestAsk: opts.bestAsk,
    structuralWalls: opts.structuralWalls,
    majorWalls: opts.majorWalls,
  }).cells;
}

export function clampPulledRestingSpanEnds(
  cells: Array<{ side: "bid" | "ask"; price: number; endTimeBucket?: number; timeBucket: number; maxSizeInBucket: number }>,
  staleLevels: BookLevel[],
  samplerMs: number,
): typeof cells {
  if (!staleLevels.length) return cells;
  const pulledByKey = new Map<string, number>();
  for (const level of staleLevels) {
    if (level.size > 0 || !level.stale) continue;
    const bp = bucketPrice(level.price, 5);
    pulledByKey.set(
      `${level.side}:${bp}`,
      Math.floor(level.lastUpdateTs / samplerMs) * samplerMs + samplerMs,
    );
  }
  if (pulledByKey.size === 0) return cells;

  return cells.map((cell) => {
    const capEnd = pulledByKey.get(`${cell.side}:${cell.price}`);
    if (capEnd == null || cell.endTimeBucket == null) return cell;
    if (cell.endTimeBucket <= capEnd) return cell;
    return {
      ...cell,
      endTimeBucket: Math.max(cell.timeBucket + samplerMs, capEnd),
    };
  });
}

function historicalStatsAtPrice(
  cells: HeatmapCell[],
  side: "bid" | "ask",
  bucketPrice: number,
): {
  cellCount: number;
  maxSize: number;
  lastTimeBucket: number | null;
} {
  let cellCount = 0;
  let maxSize = 0;
  let lastTimeBucket: number | null = null;
  for (const cell of cells) {
    if (cell.side !== side || cell.price !== bucketPrice) continue;
    cellCount += 1;
    maxSize = Math.max(maxSize, cell.maxSizeInBucket);
    if (lastTimeBucket == null || cell.timeBucket > lastTimeBucket) {
      lastTimeBucket = cell.timeBucket;
    }
  }
  return { cellCount, maxSize, lastTimeBucket };
}

function containsPrice(
  levels: Array<{ side: "bid" | "ask"; price: number }>,
  side: "bid" | "ask",
  bucketPrice: number,
): boolean {
  return levels.some((l) => l.side === side && l.price === bucketPrice);
}

export function buildBookmapRestingLiquidityLifecycleAudit(opts: {
  market: string;
  sourceMode: string;
  domSource: string;
  spotPrice: number | null;
  dataEndTime: number;
  visibleEndTime: number;
  rawHeatmapCells: HeatmapCell[];
  renderData: RestingLiquidityRenderSlice | null;
  bookLevels: LiveDomBookLevel[];
  config: RestingLiquidityWriteConfig;
  trackedPrice?: number | null;
  trackedSide?: "bid" | "ask" | null;
}): BookmapRestingLiquidityLifecycleAudit {
  const {
    rawHeatmapCells,
    renderData,
    bookLevels,
    config,
    spotPrice,
  } = opts;

  const mid = spotPrice;
  const liveProjection = renderData?.liveProjectionLevels ?? [];
  const activeDomBands = renderData?.activeDomBands ?? [];
  const textureCells = renderData?.textureCells ?? [];
  const wallBands = renderData?.bands ?? [];

  const topLevels = [...bookLevels]
    .filter((l) => l.size > 0)
    .sort((a, b) => b.size - a.size)
    .slice(0, 10);

  let trackedPrice = opts.trackedPrice ?? null;
  let trackedSide = opts.trackedSide ?? null;
  if (trackedPrice == null && topLevels[0]) {
    trackedPrice = topLevels[0].price;
    trackedSide = topLevels[0].side;
  }

  const trackedBucket =
    trackedPrice != null && trackedSide != null
      ? bucketPrice(trackedPrice, config.priceBucketUsd)
      : null;

  const lifecycle =
    trackedBucket != null && trackedSide != null
      ? lifecycleByKey.get(lifecycleKey(trackedSide, trackedBucket) as `${"bid"|"ask"}:${number}`)
      : undefined;

  const rawStats =
    trackedBucket != null && trackedSide != null
      ? historicalStatsAtPrice(rawHeatmapCells, trackedSide, trackedBucket)
      : { cellCount: 0, maxSize: 0, lastTimeBucket: null };

  const textureAtPrice = textureCells.filter(
    (c) =>
      trackedSide != null &&
      trackedBucket != null &&
      c.side === trackedSide &&
      c.price === trackedBucket,
  );
  const historicalSpanCountAtPrice = textureAtPrice.length;
  const historicalMaxIntensityAtPrice = textureAtPrice.reduce(
    (m, c) => Math.max(m, c.intensity ?? 0, c.historicalRenderIntensity ?? 0),
    0,
  );

  const currentDomSize =
    trackedPrice != null && trackedSide != null
      ? bookLevels.find(
          (l) =>
            l.side === trackedSide &&
            bucketPrice(l.price, config.priceBucketUsd) === trackedBucket,
        )?.size ?? 0
      : 0;

  const shouldBeHistoricalWall =
    trackedPrice != null &&
    (currentDomSize >= config.wallMinBtc ||
      (lifecycle?.peakSize ?? 0) >= config.wallMinBtc);

  const shouldLeaveFootprint =
    !lifecycle?.active &&
    (lifecycle?.peakSize ?? 0) >= config.near035MinBtc &&
    lifecycle?.disappearedAt != null;

  const footprintVisible = textureAtPrice.some((c) => {
    const end =
      c.endTimeBucket ?? c.timeBucket + config.samplerMs;
    return end < opts.dataEndTime - config.samplerMs * 0.5;
  });

  const liveProjectionContainsPrice =
    trackedBucket != null &&
    trackedSide != null &&
    containsPrice(liveProjection, trackedSide, trackedBucket);
  const activeDomBandsContainsPrice =
    trackedBucket != null &&
    trackedSide != null &&
    containsPrice(activeDomBands, trackedSide, trackedBucket);
  const wallBandsContainsPrice =
    trackedBucket != null &&
    trackedSide != null &&
    wallBands.some((b) => b.side === trackedSide && b.price === trackedBucket);
  const historicalTextureContainsPrice = textureAtPrice.length > 0;

  const missingHistoricalWrite =
    shouldBeHistoricalWall &&
    (lifecycle?.active || (lifecycle?.peakSize ?? 0) > 0) &&
    rawStats.cellCount === 0 &&
    !historicalTextureContainsPrice;

  const liveOnlyBugDetected =
    (liveProjectionContainsPrice || activeDomBandsContainsPrice) &&
    !historicalTextureContainsPrice &&
    rawStats.cellCount === 0 &&
    (currentDomSize >= config.near035MinBtc ||
      (lifecycle?.peakSize ?? 0) >= config.near035MinBtc);

  const footprintMissingBugDetected =
    shouldLeaveFootprint && !footprintVisible && rawStats.cellCount === 0;

  const topDomLifecycleAudit: TopDomLifecycleAuditRow[] = topLevels.map(
    (level) => {
      const bp = bucketPrice(level.price, config.priceBucketUsd);
      const isTopDom = true;
      const shouldBeHistorical = shouldWriteRestingLiquidityToHistory({
        sizeBtc: level.size,
        price: level.price,
        midPrice: mid,
        config,
        isTopDom,
      });
      const raw = historicalStatsAtPrice(rawHeatmapCells, level.side, bp);
      const inHistoricalTexture = textureCells.some(
        (c) => c.side === level.side && c.price === bp,
      );
      const inLiveProjection = containsPrice(liveProjection, level.side, bp);
      const inActiveDomBands = containsPrice(activeDomBands, level.side, bp);
      const inWallBands = wallBands.some(
        (b) => b.side === level.side && b.price === bp,
      );
      let bug: string | null = null;
      if (shouldBeHistorical && !inHistoricalTexture && raw.cellCount === 0) {
        bug = liveOnlyBugDetected ? "live-only" : "missing-historical-write";
      } else if (
        shouldBeHistorical &&
        !level.size &&
        !inHistoricalTexture
      ) {
        bug = "footprint-missing";
      }
      return {
        side: level.side,
        price: level.price,
        bucketPrice: bp,
        size: level.size,
        activeInDom: level.size > 0,
        inLiveProjection,
        inActiveDomBands,
        inHistoricalTexture,
        inWallBands,
        historicalCellCount: raw.cellCount,
        historicalMaxSize: raw.maxSize,
        shouldBeHistorical,
        bug,
      };
    },
  );

  return {
    market: opts.market,
    sourceMode: opts.sourceMode,
    domSource: opts.domSource,
    spotPrice,
    dataEndTime: opts.dataEndTime,
    visibleEndTime: opts.visibleEndTime,
    trackedPrice,
    trackedBucketPrice: trackedBucket,
    trackedSide,
    currentDomSizeAtTrackedPrice: currentDomSize,
    previousDomSizeAtTrackedPrice: lifecycle?.previousFrameSize ?? 0,
    sizeDeltaAtTrackedPrice:
      currentDomSize - (lifecycle?.previousFrameSize ?? currentDomSize),
    isCurrentlyActiveInDom: lifecycle?.active ?? currentDomSize > 0,
    wasActiveInPreviousSnapshot: lifecycle?.wasActive ?? false,
    firstSeenAt: lifecycle?.firstSeenAt ?? null,
    lastSeenAt: lifecycle?.lastSeenAt ?? null,
    activeDurationMs: lifecycle?.activeDurationMs ?? 0,
    disappearedAt: lifecycle?.disappearedAt ?? null,
    pulledRecently: lifecycle?.pulled ?? false,
    writtenToHistoricalTexture:
      lifecycle?.historicalWritten ?? rawStats.cellCount > 0,
    historicalCellCountAtPrice: rawStats.cellCount,
    historicalSpanCountAtPrice,
    historicalMaxSizeAtPrice: Math.max(rawStats.maxSize, lifecycle?.peakSize ?? 0),
    historicalMaxIntensityAtPrice,
    historicalLastTimeBucketAtPrice: rawStats.lastTimeBucket,
    liveProjectionContainsPrice,
    activeDomBandsContainsPrice,
    wallBandsContainsPrice,
    historicalTextureContainsPrice,
    shouldBeHistoricalWall,
    shouldLeaveFootprint,
    footprintVisible,
    footprintIntensity: historicalMaxIntensityAtPrice,
    footprintAlpha: Math.min(0.65, historicalMaxIntensityAtPrice * 0.85),
    missingHistoricalWrite,
    liveOnlyBugDetected,
    footprintMissingBugDetected,
    lifecycleOk:
      !missingHistoricalWrite &&
      !liveOnlyBugDetected &&
      !footprintMissingBugDetected,
    topDomLifecycleAudit,
  };
}
