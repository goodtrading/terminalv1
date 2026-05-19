import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { DEPTH_RANGE_PRESETS } from "@/lib/bookmapDepthRange";
import {
  LOCAL_RANGE_USD_OPTIONS,
  RIGHT_SPACE_PCT_OPTIONS,
} from "@/components/flows/bookmapViewMode";
import { PERP_OVERLAY_OPACITY_OPTIONS } from "@shared/bookmapSourceMode";
import type { BookmapOperationalConfig } from "./bookmapOperationalConfig";
import {
  BookmapSegmentGroup,
  BookmapToggleButton,
  bookmapToolbarBtnClass,
} from "./BookmapToolbarSegments";

const selectClass =
  "bg-[#0a121c] border border-slate-700/80 rounded px-1.5 py-0.5 text-[10px] font-mono text-slate-200";

function ConfigSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-b border-cyan-500/10 pb-2.5 mb-2.5 last:border-0 last:mb-0 last:pb-0">
      <h3 className="text-[9px] font-mono uppercase tracking-widest text-cyan-400/80 mb-2">
        {title}
      </h3>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function ConfigRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="text-[10px] font-mono text-slate-500 shrink-0">{label}</span>
      <div className="flex flex-wrap items-center gap-1 justify-end min-w-0">{children}</div>
    </div>
  );
}

const SOURCE_OPTIONS = [
  { value: "spot" as const, label: "Spot" },
  { value: "perp" as const, label: "Perp" },
  { value: "both" as const, label: "Both" },
];

const MARKET_OPTIONS = [
  { value: "spot" as const, label: "Spot" },
  { value: "perp" as const, label: "Perp" },
];

export function BookmapOperationalSections({ op }: { op: BookmapOperationalConfig }) {
  const showPerpOpacity = op.sourceMode === "both" || op.sourceMode === "perp";

  return (
    <>
      <ConfigSection title="Sources">
        <ConfigRow label="Source">
          <BookmapSegmentGroup
            value={op.sourceMode}
            options={SOURCE_OPTIONS}
            onChange={op.onSourceModeChange}
          />
        </ConfigRow>
        <ConfigRow label="DOM">
          <BookmapSegmentGroup
            value={op.domSource}
            options={MARKET_OPTIONS}
            onChange={op.onDomSourceChange}
          />
        </ConfigRow>
        <ConfigRow label="Trades">
          <BookmapSegmentGroup
            value={op.tradeSource}
            options={MARKET_OPTIONS}
            onChange={op.onTradeSourceChange}
          />
        </ConfigRow>
        {showPerpOpacity && (
          <ConfigRow label="Perp opacity">
            <select
              value={op.perpOverlayOpacityPct}
              onChange={(e) =>
                op.onPerpOverlayOpacityChange(
                  Number(e.target.value) as (typeof PERP_OVERLAY_OPACITY_OPTIONS)[number],
                )
              }
              className={selectClass}
            >
              {PERP_OVERLAY_OPACITY_OPTIONS.map((pct) => (
                <option key={pct} value={pct}>
                  {pct}%
                </option>
              ))}
            </select>
          </ConfigRow>
        )}
      </ConfigSection>

      <ConfigSection title="Depth / View">
        <ConfigRow label="Depth">
          <select
            value={op.depthRangePreset}
            onChange={(e) => op.onDepthPresetChange(e.target.value as typeof op.depthRangePreset)}
            className={cn(selectClass, "max-w-[140px]")}
          >
            {DEPTH_RANGE_PRESETS.map((p) => (
              <option key={p} value={p}>
                {op.depthPresetLabel(p)}
              </option>
            ))}
          </select>
        </ConfigRow>
        {op.depthRangePreset === "local" && (
          <ConfigRow label="Local ±">
            <select
              value={op.localRangeUsd}
              onChange={(e) =>
                op.onLocalRangeUsdChange(Number(e.target.value) as typeof op.localRangeUsd)
              }
              className={selectClass}
            >
              {LOCAL_RANGE_USD_OPTIONS.map((v) => (
                <option key={v} value={v}>
                  ${v}
                </option>
              ))}
            </select>
          </ConfigRow>
        )}
        <ConfigRow label="Auto center">
          <BookmapToggleButton
            label={op.ladderAutoCenter ? "ON" : "OFF"}
            active={op.ladderAutoCenter}
            onClick={() => op.onLadderAutoCenterChange(!op.ladderAutoCenter)}
          />
        </ConfigRow>
        <ConfigRow label="Follow live">
          <BookmapToggleButton
            label={op.followLive ? "ON" : "OFF"}
            active={op.followLive}
            onClick={() => op.onFollowLiveChange(!op.followLive)}
            disabled={op.followLiveDisabled}
          />
        </ConfigRow>
        <ConfigRow label="Right space">
          <select
            value={op.rightSpacePct}
            onChange={(e) => {
              const v = Number(e.target.value);
              const snapped = RIGHT_SPACE_PCT_OPTIONS.includes(v as typeof op.rightSpacePct)
                ? (v as typeof op.rightSpacePct)
                : RIGHT_SPACE_PCT_OPTIONS.reduce((best, o) =>
                    Math.abs(o - v) < Math.abs(best - v) ? o : best,
                  );
              op.onRightSpacePctChange(snapped);
            }}
            disabled={op.rightSpaceDisabled}
            className={selectClass}
          >
            {RIGHT_SPACE_PCT_OPTIONS.map((v) => (
              <option key={v} value={v}>
                {v === 0 ? "OFF" : `${v}%`}
              </option>
            ))}
          </select>
        </ConfigRow>
        <ConfigRow label="View actions">
          <div className="flex flex-wrap gap-1 justify-end">
            <button type="button" onClick={op.onFitWalls} className={bookmapToolbarBtnClass}>
              Fit Walls
            </button>
            <button type="button" onClick={op.onResetSpot} className={bookmapToolbarBtnClass}>
              Reset Spot
            </button>
            <button type="button" onClick={op.onZoomIn} className={bookmapToolbarBtnClass}>
              Zoom In
            </button>
            <button type="button" onClick={op.onZoomOut} className={bookmapToolbarBtnClass}>
              Zoom Out
            </button>
          </div>
        </ConfigRow>
      </ConfigSection>

      <ConfigSection title="Liquidity">
        <ConfigRow label="Major walls preset">
          <button
            type="button"
            onClick={op.onFitMajorWalls}
            className={cn(
              bookmapToolbarBtnClass,
              op.majorWallsPresetActive && "border-amber-500/40 text-amber-300",
            )}
          >
            Major Walls
          </button>
        </ConfigRow>
        <ConfigRow label="Min wall (BTC)">
          <select
            value={op.minVisibleBtc}
            onChange={(e) => op.onMinVisibleBtcChange(Number(e.target.value))}
            disabled={op.minSizeDisabled}
            className={selectClass}
          >
            {op.minSizeOptions.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </ConfigRow>
        <ConfigRow label="Major only">
          <BookmapToggleButton
            label={op.majorWallsOnly ? "ON" : "OFF"}
            active={op.majorWallsOnly}
            onClick={() => op.onMajorWallsOnlyChange(!op.majorWallsOnly)}
            activeClassName="border-terminal-accent bg-terminal-accent/15 text-terminal-accent"
          />
        </ConfigRow>
        <ConfigRow label="Important far">
          <BookmapToggleButton
            label={op.showImportantFarLevels ? "ON" : "OFF"}
            active={op.showImportantFarLevels}
            onClick={() => op.onShowImportantFarLevelsChange(!op.showImportantFarLevels)}
            activeClassName="border-cyan-500/40 text-cyan-300"
          />
        </ConfigRow>
      </ConfigSection>

      <ConfigSection title="Display">
        <p className="text-[9px] font-mono text-slate-600 leading-relaxed">
          Heatmap, DOM, and trade-dot styling below. Top-bar metrics and debug toggles under
          Layout.
        </p>
      </ConfigSection>
    </>
  );
}
