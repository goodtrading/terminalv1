import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import {
  getDomDisplayFlags,
  getDomGridClass,
  type DomColumnLayout,
} from "./bookmapLayoutConstants";
import {
  DOM_ASK_RGB,
  DOM_BID_RGB,
  DOM_COB_RGB,
  DOM_FONT_CLASS,
  DOM_HEADER_CLASS,
  DOM_MAX_BAR_WIDTH_PCT,
  DOM_MIN_BAR_PX,
  DOM_MIN_BAR_WIDTH_PCT,
  DOM_TEXT_DIM,
  DOM_TEXT_PRIMARY,
} from "./bookmapDomVisual";
import { BOOKMAP_PLOT_PAD } from "./bookmapViewportUtils";
import {
  buildScaffoldedDomRows,
  formatBookmapPrice,
  formatDomSize,
  bucketPrice,
  type DomEngineBook,
  type DomEngineBookLevel,
  type DomLiquidityState,
  type DomLadderRow,
  type DomWallEntry,
} from "./domLadderUtils";
import type { BookmapPriceScale } from "@/hooks/useBookmapPriceScale";
import type { LiquiditySnapshot } from "./liquidityHeatmapUtils";
import {
  getOffRangeImportantLevels,
  MAJOR_WALL_BTC,
  type ImportantLiquidityLevel,
} from "./importantLiquidityLevels";
import type { BookmapViewMode } from "./bookmapViewMode";

export type BookmapDomPanelProps = {
  snapshot?: LiquiditySnapshot | undefined;
  engineMode?: boolean;
  engineBook?: DomEngineBook;
  engineBids?: DomEngineBookLevel[];
  engineAsks?: DomEngineBookLevel[];
  spot: number | null;
  scale: BookmapPriceScale;
  panelWidth: number;
  viewMode?: BookmapViewMode;
  importantLevels?: ImportantLiquidityLevel[];
  wallEntries?: DomWallEntry[];
  showImportantStrip?: boolean;
  showPlotBoundsDebug?: boolean;
};

const VIEWPORT_ROW_MARGIN_PX = 6;

function domBarWidthPct(size: number, maxSideSize: number): number {
  if (size <= 0 || !Number.isFinite(size)) return 0;
  const maxRef = Math.max(maxSideSize, 1e-9);
  const normalized = size / maxRef;
  return Math.max(
    DOM_MIN_BAR_WIDTH_PCT,
    Math.min(DOM_MAX_BAR_WIDTH_PCT, normalized * 100),
  );
}

function domBarAlpha(
  size: number,
  maxSideSize: number,
  liquidityState: DomLiquidityState,
): number {
  const maxRef = Math.max(maxSideSize, 1e-9);
  const normalized = Math.max(0, Math.min(1, size / maxRef));
  let alpha = 0.55 + normalized * 0.35;
  if (liquidityState === "lastKnown") alpha *= 0.65;
  if (liquidityState === "wall") alpha *= 0.75;
  return Math.min(0.92, alpha);
}

function histWallLabel(wall: DomWallEntry): string {
  const side = wall.side === "bid" ? "BID" : "ASK";
  const btc = Math.round(wall.wallSize);
  if (wall.wallTier === "major") return `MAJOR ${side} ${btc}`;
  return `${side} WALL ${btc}`;
}

function DomWallMarker({ row }: { row: DomLadderRow }) {
  const labels: string[] = [];
  if (row.wallBid) labels.push(histWallLabel(row.wallBid));
  if (row.wallAsk) labels.push(histWallLabel(row.wallAsk));
  if (!labels.length) return null;

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-0.5 px-1">
      {labels.map((label) => (
        <span
          key={label}
          className={cn(
            "max-w-full truncate rounded px-1.5 py-0.5 text-[10px] font-mono font-semibold uppercase tracking-tight",
            label.includes("BID") ? "text-emerald-200" : "text-red-200",
          )}
          title={label}
        >
          {label}
        </span>
      ))}
    </div>
  );
}

function formatDomCellSize(size: number, state: DomLiquidityState): string {
  const base = formatDomSize(size);
  if (base === "—" || state === "live" || state === "wall") return base;
  if (state === "lastKnown") return `${base}`;
  return base;
}

function DomValueText({
  size,
  state,
  showLkSuffix,
}: {
  size: number;
  state: DomLiquidityState;
  showLkSuffix?: boolean;
}) {
  const isLastKnown = state === "lastKnown";
  return (
    <span
      className={cn(
        "relative z-[2] flex items-center justify-center gap-1",
        DOM_FONT_CLASS,
        isLastKnown && "opacity-[0.78]",
      )}
      style={{ color: isLastKnown ? DOM_TEXT_DIM : DOM_TEXT_PRIMARY }}
    >
      {formatDomCellSize(size, state)}
      {showLkSuffix && isLastKnown && (
        <span className="text-[9px] font-bold uppercase opacity-80">LK</span>
      )}
    </span>
  );
}

function DomBarCell({
  size,
  maxSideSize,
  rgb,
  showText,
  liquidityState = "live",
  showLkSuffix = true,
}: {
  size: number;
  maxSideSize: number;
  rgb: readonly [number, number, number];
  showText: boolean;
  liquidityState?: DomLiquidityState;
  showLkSuffix?: boolean;
}) {
  const hasSize = size > 0;
  const widthPct = domBarWidthPct(size, maxSideSize);
  const alpha = domBarAlpha(size, maxSideSize, liquidityState);
  const [r, g, b] = rgb;

  return (
    <div className="relative flex h-full w-full items-center justify-center overflow-hidden px-0.5">
      {hasSize && (
        <div
          className="absolute inset-y-[2px] rounded-[2px]"
          style={{
            width: `max(${DOM_MIN_BAR_PX}px, ${widthPct}%)`,
            left: "50%",
            transform: "translateX(-50%)",
            backgroundColor: `rgba(${r}, ${g}, ${b}, ${alpha})`,
          }}
        />
      )}
      {showText && hasSize && (
        <DomValueText size={size} state={liquidityState} showLkSuffix={showLkSuffix} />
      )}
    </div>
  );
}

function DomSvpCell({
  svpValue,
  maxSvp,
  showText,
}: {
  svpValue: number;
  maxSvp: number;
  showText: boolean;
}) {
  const hasValue = svpValue > 0;
  const widthPct = domBarWidthPct(svpValue, maxSvp);

  return (
    <div className="relative flex h-full w-full items-center justify-center overflow-hidden px-0.5">
      {hasValue && (
        <div
          className="absolute inset-y-[2px] rounded-[2px] bg-slate-600/35"
          style={{
            width: `max(${DOM_MIN_BAR_PX}px, ${widthPct}%)`,
            left: "50%",
            transform: "translateX(-50%)",
          }}
        />
      )}
      {showText && hasValue && (
        <span className={cn("relative z-[2]", DOM_FONT_CLASS)}>{formatDomSize(svpValue)}</span>
      )}
    </div>
  );
}

function DomHeader({
  layout,
  showSvp,
}: {
  layout: DomColumnLayout;
  showSvp: boolean;
}) {
  const gridClass = getDomGridClass(layout);

  return (
    <div
      className={cn(
        gridClass,
        "border-b border-slate-700/50 bg-[#0a1018] px-0.5 py-1.5",
        DOM_HEADER_CLASS,
      )}
    >
      {layout !== "bid-ask" && (
        <span className="flex items-center justify-center text-center text-slate-400">
          COB
        </span>
      )}
      <span className="flex items-center justify-center text-center text-emerald-400">
        BID
      </span>
      <span className="flex items-center justify-center text-center text-red-400">
        ASK
      </span>
      {showSvp && layout === "full" && (
        <span className="flex items-center justify-center text-center text-slate-400">
          SVP
        </span>
      )}
    </div>
  );
}

function DomRowCells({
  row,
  layout,
  showText,
  showSvp,
  maxBidSize,
  maxAskSize,
  maxCobSize,
  maxSvpSize,
}: {
  row: DomLadderRow;
  layout: DomColumnLayout;
  showText: boolean;
  showSvp: boolean;
  maxBidSize: number;
  maxAskSize: number;
  maxCobSize: number;
  maxSvpSize: number;
}) {
  const cobAbs = row.cobSize;
  const cellText = showText && row.showDomText;

  if (layout === "bid-ask") {
    return (
      <>
        <DomBarCell
          size={row.bidSize}
          maxSideSize={maxBidSize}
          rgb={DOM_BID_RGB}
          showText={cellText}
          liquidityState={row.bidState}
        />
        <DomBarCell
          size={row.askSize}
          maxSideSize={maxAskSize}
          rgb={DOM_ASK_RGB}
          showText={cellText}
          liquidityState={row.askState}
        />
      </>
    );
  }

  return (
    <>
      <DomBarCell
        size={cobAbs}
        maxSideSize={maxCobSize}
        rgb={DOM_COB_RGB}
        showText={cellText && cobAbs > 0}
        liquidityState="live"
        showLkSuffix={false}
      />
      <DomBarCell
        size={row.bidSize}
        maxSideSize={maxBidSize}
        rgb={DOM_BID_RGB}
        showText={cellText}
        liquidityState={row.bidState}
      />
      <DomBarCell
        size={row.askSize}
        maxSideSize={maxAskSize}
        rgb={DOM_ASK_RGB}
        showText={cellText}
        liquidityState={row.askState}
      />
      {showSvp && layout === "full" && (
        <DomSvpCell
          svpValue={row.svpCumulative}
          maxSvp={maxSvpSize}
          showText={cellText}
        />
      )}
    </>
  );
}

export function BookmapDomPanel({
  snapshot,
  engineMode = false,
  engineBook,
  engineBids,
  engineAsks,
  spot,
  scale,
  panelWidth,
  viewMode = "local",
  importantLevels,
  wallEntries,
  showImportantStrip = false,
  showPlotBoundsDebug = false,
}: BookmapDomPanelProps) {
  const plotRef = useRef<HTMLDivElement>(null);
  const [plotHeight, setPlotHeight] = useState(0);
  const domFlags = getDomDisplayFlags(panelWidth);
  const { layout: columnLayout, showNumbers: widthAllowsNumbers, showSvp } = domFlags;
  const isLocalMode = viewMode === "local";
  const showNumbers = engineMode || (isLocalMode && widthAllowsNumbers);
  const gridClass = getDomGridClass(columnLayout);

  useEffect(() => {
    const el = plotRef.current;
    if (!el) return;

    const sync = () => setPlotHeight(el.clientHeight);
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    sync();
    return () => ro.disconnect();
  }, []);

  const { priceRange, domBucketSize, priceToY } = scale;

  const { rows, stats } = useMemo(() => {
    if (plotHeight < 20) {
      return {
        rows: [] as DomLadderRow[],
        stats: { ladderRows: 0, liveRows: 0, lastKnownRows: 0, wallRows: 0 },
      };
    }
    return buildScaffoldedDomRows({
      bids: engineMode ? undefined : snapshot?.bids,
      asks: engineMode ? undefined : snapshot?.asks,
      engineBook: engineMode ? engineBook : undefined,
      engineBids: engineMode ? undefined : engineBids,
      engineAsks: engineMode ? undefined : engineAsks,
      walls: wallEntries,
      spot,
      priceRange,
      priceStep: domBucketSize,
      plotHeight,
      priceToY,
      showDomNumbers: showNumbers,
    });
  }, [
    engineMode,
    snapshot,
    engineBook,
    engineBids,
    engineAsks,
    wallEntries,
    spot,
    priceRange,
    domBucketSize,
    plotHeight,
    priceToY,
    showNumbers,
  ]);

  const viewportRows = useMemo(() => {
    const yMin = BOOKMAP_PLOT_PAD.top - VIEWPORT_ROW_MARGIN_PX;
    const yMax = plotHeight - BOOKMAP_PLOT_PAD.bottom + VIEWPORT_ROW_MARGIN_PX;
    return rows.filter((row) => row.y >= yMin && row.y <= yMax);
  }, [rows, plotHeight]);

  const maxBidSize = useMemo(
    () => Math.max(...rows.map((r) => r.bidSize), 1e-9),
    [rows],
  );
  const maxAskSize = useMemo(
    () => Math.max(...rows.map((r) => r.askSize), 1e-9),
    [rows],
  );
  const maxCobSize = useMemo(
    () => Math.max(...rows.map((r) => r.cobSize), 1e-9),
    [rows],
  );
  const maxSvpSize = useMemo(
    () => Math.max(...rows.map((r) => r.svpCumulative), 1e-9),
    [rows],
  );

  const bestBidPrice = useMemo(() => {
    const withBid = rows.filter((r) => r.hasLiveBid);
    if (!withBid.length) return null;
    return withBid.reduce((best, r) => (r.price > best ? r.price : best), withBid[0]!.price);
  }, [rows]);

  const bestAskPrice = useMemo(() => {
    const withAsk = rows.filter((r) => r.hasLiveAsk);
    if (!withAsk.length) return null;
    return withAsk.reduce((best, r) => (r.price < best ? r.price : best), withAsk[0]!.price);
  }, [rows]);

  const highlightPrices = useMemo(() => {
    if (!importantLevels?.length) return null as ReadonlySet<number> | null;
    const s = new Set<number>();
    for (const l of importantLevels) {
      if (l.price < priceRange.minPrice || l.price > priceRange.maxPrice) continue;
      if (l.kind === "MAJOR_WALL" || l.sizeBtc >= MAJOR_WALL_BTC) {
        s.add(bucketPrice(l.price, domBucketSize));
      } else if (l.kind === "TOP_LIQUIDITY") {
        s.add(bucketPrice(l.price, domBucketSize));
      }
    }
    return s;
  }, [importantLevels, priceRange.minPrice, priceRange.maxPrice, domBucketSize]);

  const { wallsAbove, wallsBelow } = useMemo(() => {
    if (!showImportantStrip || !importantLevels?.length) {
      return { wallsAbove: [] as ImportantLiquidityLevel[], wallsBelow: [] as ImportantLiquidityLevel[] };
    }
    const { above, below } = getOffRangeImportantLevels(
      importantLevels,
      priceRange.minPrice,
      priceRange.maxPrice,
    );
    return {
      wallsAbove: above.filter((l) => l.kind !== "FAR_WALL" || l.sizeBtc >= MAJOR_WALL_BTC).slice(0, 4),
      wallsBelow: below.filter((l) => l.kind !== "FAR_WALL" || l.sizeBtc >= MAJOR_WALL_BTC).slice(0, 4),
    };
  }, [importantLevels, priceRange, showImportantStrip]);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    console.debug("[DOM_SCAFFOLD]", {
      ...stats,
      viewportRendered: viewportRows.length,
      rangeMin: priceRange.minPrice,
      rangeMax: priceRange.maxPrice,
      domBucketSize,
    });
  }, [stats, viewportRows.length, priceRange, domBucketSize]);

  return (
    <div
      ref={plotRef}
      className="relative h-full min-h-0 w-full flex-1 overflow-hidden bg-[#080d14]"
    >
      <div className="pointer-events-none absolute top-0 left-0 right-0 z-20 border-b border-slate-700/40 bg-[#0a1018]/98">
        <div className="px-2 py-1.5">
          <div className="text-[11px] font-mono font-bold uppercase tracking-widest text-slate-300">
            DOM / COB
          </div>
          {import.meta.env.DEV && stats.ladderRows > 0 && (
            <div className="text-[9px] font-mono text-slate-600 tabular-nums">
              rows {stats.ladderRows} · live {stats.liveRows} · LK {stats.lastKnownRows}
              {!showNumbers ? " · nums off" : ""}
            </div>
          )}
        </div>
        <DomHeader layout={columnLayout} showSvp={showSvp} />
        {showImportantStrip && wallsAbove.length > 0 && (
          <div className="pointer-events-none border-t border-slate-700/30 px-2 py-1 text-[10px] font-mono text-red-300/90">
            <div className="mb-0.5 font-semibold uppercase tracking-wide">Ask walls above</div>
            {wallsAbove.map((l) => (
              <div key={`a_${l.price}_${l.kind}`}>
                {formatBookmapPrice(l.price)} · {formatDomSize(l.sizeBtc)} BTC
              </div>
            ))}
          </div>
        )}
      </div>

      {showPlotBoundsDebug && plotHeight > 0 && (
        <>
          <div
            className="pointer-events-none absolute left-0 right-0 z-30 border-t border-slate-600/40"
            style={{ top: BOOKMAP_PLOT_PAD.top }}
          />
          <div
            className="pointer-events-none absolute left-0 right-0 z-30 border-b border-slate-600/40"
            style={{ top: plotHeight - BOOKMAP_PLOT_PAD.bottom }}
          />
        </>
      )}

      {showImportantStrip && wallsBelow.length > 0 && (
        <div className="pointer-events-none absolute bottom-0 left-0 right-0 z-20 border-t border-slate-700/40 bg-[#0a1018]/95 px-2 py-1 text-[10px] font-mono text-emerald-300/90">
          <div className="mb-0.5 font-semibold uppercase tracking-wide">Bid walls below</div>
          {wallsBelow.map((l) => (
            <div key={`b_${l.price}_${l.kind}`}>
              {formatBookmapPrice(l.price)} · {formatDomSize(l.sizeBtc)} BTC
            </div>
          ))}
        </div>
      )}

      {stats.ladderRows === 0 ? (
        <div className="absolute inset-0 flex items-center justify-center p-4 text-center text-[12px] font-mono text-slate-500">
          {plotHeight < 20 ? "…" : "No ladder rows"}
        </div>
      ) : (
        viewportRows.map((row) => {
          const hasDisplay =
            row.bidSize > 0 || row.askSize > 0 || row.hasHistoricalWall;
          const wallOnly =
            row.hasHistoricalWall &&
            row.bidSize <= 0 &&
            row.askSize <= 0 &&
            row.bidState !== "wall" &&
            row.askState !== "wall";
          const importantHighlight = Boolean(highlightPrices?.has(row.price));
          const isBestBid =
            bestBidPrice != null && row.price === bestBidPrice && row.hasLiveBid;
          const isBestAsk =
            bestAskPrice != null && row.price === bestAskPrice && row.hasLiveAsk;
          const top = row.y - row.barHeight / 2;
          const h = Math.max(20, row.barHeight);

          return (
            <div
              key={row.price}
              className={cn(
                wallOnly ? "flex" : gridClass,
                "pointer-events-none absolute left-0 right-0 z-10",
                "border-b border-slate-800/25",
                row.isSpotBucket &&
                  "z-[15] bg-amber-500/[0.12] border-amber-500/30",
                isBestBid && !row.isSpotBucket && "bg-emerald-950/20",
                isBestAsk && !row.isSpotBucket && "bg-red-950/15",
                importantHighlight &&
                  !row.isSpotBucket &&
                  !isBestBid &&
                  !isBestAsk &&
                  "bg-slate-800/15",
              )}
              style={{ top, height: h }}
            >
              {wallOnly ? (
                <DomWallMarker row={row} />
              ) : (
                <DomRowCells
                  row={row}
                  layout={columnLayout}
                  showText={showNumbers}
                  showSvp={showSvp}
                  maxBidSize={maxBidSize}
                  maxAskSize={maxAskSize}
                  maxCobSize={maxCobSize}
                  maxSvpSize={maxSvpSize}
                />
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
