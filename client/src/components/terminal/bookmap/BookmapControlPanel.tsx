import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import {
  DEFAULT_BOOKMAP_VISUAL_SETTINGS,
  type BookmapVisualSettings,
  type DotScaleMode,
  type BidAskLineOpacity,
  type ExecutionRailLength,
  type HeatmapIntensityMode,
} from "./bookmapSettings";
import type { BookmapOperationalConfig } from "./bookmapOperationalConfig";
import { BookmapOperationalSections } from "./BookmapOperationalSections";
import {
  BookmapConfluenceSections,
  type BookmapConfluenceControls,
} from "./BookmapConfluenceSections";
import { BookmapDivergenceSections } from "./BookmapDivergenceSections";

export interface BookmapControlPanelProps {
  settings: BookmapVisualSettings;
  onChange: (next: BookmapVisualSettings) => void;
  onClose: () => void;
  onReset: () => void;
  operational: BookmapOperationalConfig;
  confluence?: BookmapConfluenceControls;
}

function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="border-b border-cyan-500/10 pb-2.5 mb-2.5 last:border-0 last:mb-0 last:pb-0">
      <h3 className="text-[9px] font-mono uppercase tracking-widest text-cyan-400/80 mb-2">
        {title}
      </h3>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex items-center justify-between gap-2 text-[10px] font-mono text-slate-400">
      <span className="shrink-0">{label}</span>
      <span className="min-w-0 flex-1 flex justify-end">{children}</span>
    </label>
  );
}

function Toggle({
  checked,
  onChange,
  disabled = false,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      className={cn(
        "relative w-8 h-4 rounded-full border transition-colors shrink-0",
        disabled && "opacity-40 cursor-not-allowed",
        checked
          ? "bg-cyan-600/40 border-cyan-500/50"
          : "bg-slate-900 border-slate-700",
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 w-3 h-3 rounded-full bg-slate-300 transition-transform",
          checked ? "translate-x-4" : "translate-x-0.5",
        )}
      />
    </button>
  );
}

function Slider({
  value,
  min,
  max,
  step,
  onChange,
  className,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  className?: string;
}) {
  return (
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className={cn(
        "w-[120px] h-1 accent-cyan-500 bg-slate-800 rounded",
        className,
      )}
    />
  );
}

function patchSettings(
  settings: BookmapVisualSettings,
  patch: Partial<BookmapVisualSettings>,
): BookmapVisualSettings {
  return {
    trades: { ...settings.trades, ...patch.trades },
    liquidity: { ...settings.liquidity, ...patch.liquidity },
    heatmap: { ...settings.heatmap, ...patch.heatmap },
    dom: { ...settings.dom, ...patch.dom },
    layout: { ...settings.layout, ...patch.layout },
    divergence: { ...settings.divergence, ...patch.divergence },
  };
}

export function BookmapControlPanel({
  settings,
  onChange,
  onClose,
  onReset,
  operational,
  confluence,
}: BookmapControlPanelProps) {
  const set = (patch: Partial<BookmapVisualSettings>) =>
    onChange(patchSettings(settings, patch));

  const inputClass =
    "bg-[#0a121c] border border-slate-700/80 rounded px-1.5 py-0.5 text-[10px] font-mono text-slate-200 max-w-[120px]";

  return (
    <div
      className="absolute top-10 right-3 z-[60] w-[340px] max-h-[min(78vh,640px)] overflow-y-auto rounded-lg border border-cyan-500/25 bg-[#050b12]/97 shadow-[0_8px_32px_rgba(0,0,0,0.55)] backdrop-blur-sm"
      role="dialog"
      aria-label="Bookmap configuration"
    >
      <div className="sticky top-0 flex items-center justify-between border-b border-cyan-500/20 bg-[#07111c] px-3 py-2 z-10">
        <span className="text-[11px] font-mono font-semibold tracking-wide text-cyan-300/95 uppercase">
          Config
        </span>
        <button
          type="button"
          onClick={onClose}
          className="text-[10px] font-mono text-slate-500 hover:text-slate-200 px-1.5 py-0.5"
          aria-label="Close config"
        >
          ×
        </button>
      </div>

      <div className="px-3 py-2.5">
        <BookmapOperationalSections op={operational} />
        {confluence && (
          <BookmapConfluenceSections
            bothMode={confluence.bothMode}
            prefs={confluence.prefs}
            onChange={confluence.onChange}
          />
        )}

        <Section title="Divergence">
          <BookmapDivergenceSections
            settings={settings}
            bothMode={confluence?.bothMode ?? false}
            onChange={onChange}
            Toggle={Toggle}
            Row={Row}
            inputClass={inputClass}
          />
        </Section>

        <Section title="Trades / Dots">
          <Row label="Trades enabled">
            <Toggle
              checked={settings.trades.enabled}
              onChange={(enabled) => set({ trades: { enabled } })}
            />
          </Row>
          <Row label={`Base size ${settings.trades.baseSize.toFixed(1)}`}>
            <Slider
              value={settings.trades.baseSize}
              min={2}
              max={14}
              step={0.1}
              onChange={(baseSize) => set({ trades: { baseSize } })}
            />
          </Row>
          <Row label={`Min px ${settings.trades.minSize.toFixed(0)}`}>
            <Slider
              value={settings.trades.minSize}
              min={2}
              max={12}
              step={1}
              onChange={(minSize) => set({ trades: { minSize } })}
            />
          </Row>
          <Row label={`Max px ${settings.trades.maxSize.toFixed(0)}`}>
            <Slider
              value={settings.trades.maxSize}
              min={10}
              max={50}
              step={1}
              onChange={(maxSize) => set({ trades: { maxSize } })}
            />
          </Row>
          <Row label={`Scale factor ${(settings.trades.scaleFactor ?? 2.2).toFixed(1)}`}>
            <Slider
              value={settings.trades.scaleFactor ?? 2.2}
              min={1}
              max={6}
              step={0.1}
              onChange={(scaleFactor) => set({ trades: { scaleFactor } })}
            />
          </Row>
          <Row label={`Opacity ${(settings.trades.opacity * 100).toFixed(0)}%`}>
            <Slider
              value={settings.trades.opacity}
              min={0.2}
              max={1}
              step={0.02}
              onChange={(opacity) => set({ trades: { opacity } })}
            />
          </Row>
          <Row label="Scale mode">
            <select
              value={settings.trades.scaleMode}
              onChange={(e) =>
                set({ trades: { scaleMode: e.target.value as DotScaleMode } })
              }
              className={inputClass}
            >
              <option value="linear">linear</option>
              <option value="log">log</option>
              <option value="adaptive">adaptive</option>
            </select>
          </Row>
          <Row label="Adaptive micro">
            <Toggle
              checked={settings.trades.adaptiveMicrostructure}
              onChange={(adaptiveMicrostructure) =>
                set({ trades: { adaptiveMicrostructure } })
              }
            />
          </Row>
          <Row label="Cluster trades">
            <Toggle
              checked={settings.trades.clusterTrades}
              onChange={(clusterTrades) => set({ trades: { clusterTrades } })}
            />
          </Row>
          <Row label="Execution rails">
            <Toggle
              checked={settings.trades.executionRailsEnabled}
              onChange={(executionRailsEnabled) =>
                set({ trades: { executionRailsEnabled } })
              }
            />
          </Row>
          <Row label="Rail length">
            <select
              value={settings.trades.executionRailLength}
              disabled={!settings.trades.executionRailsEnabled}
              onChange={(e) =>
                set({
                  trades: {
                    executionRailLength: e.target.value as ExecutionRailLength,
                  },
                })
              }
              className={inputClass}
            >
              <option value="short">Short</option>
              <option value="normal">Normal</option>
              <option value="long">Long</option>
            </select>
          </Row>
          <Row label="Hide small">
            <Toggle
              checked={settings.trades.hideSmallTrades}
              onChange={(hideSmallTrades) => set({ trades: { hideSmallTrades } })}
            />
          </Row>
          <Row label={`Min BTC ${settings.trades.minTradeSize.toFixed(1)}`}>
            <Slider
              value={settings.trades.minTradeSize}
              min={0}
              max={20}
              step={0.1}
              onChange={(minTradeSize) => set({ trades: { minTradeSize } })}
            />
          </Row>
          <Row label="Buy color">
            <select
              value={settings.trades.buyColorMode}
              onChange={(e) =>
                set({
                  trades: {
                    buyColorMode: e.target.value as "green" | "cyan",
                  },
                })
              }
              className={inputClass}
            >
              <option value="green">green</option>
              <option value="cyan">cyan</option>
            </select>
          </Row>
          <Row label="Sell color">
            <select
              value={settings.trades.sellColorMode}
              onChange={(e) =>
                set({
                  trades: {
                    sellColorMode: e.target.value as "red" | "orange",
                  },
                })
              }
              className={inputClass}
            >
              <option value="red">red</option>
              <option value="orange">orange</option>
            </select>
          </Row>
        </Section>

        <Section title="Liquidity">
          <Row label="Major walls">
            <Toggle
              checked={settings.liquidity.showMajorWalls}
              onChange={(showMajorWalls) => set({ liquidity: { showMajorWalls } })}
            />
          </Row>
          <Row label="Important walls">
            <Toggle
              checked={settings.liquidity.showAllImportantWalls}
              onChange={(showAllImportantWalls) =>
                set({ liquidity: { showAllImportantWalls } })
              }
            />
          </Row>
          <Row label={`Min wall ${settings.liquidity.minWallSizeBtc} BTC`}>
            <Slider
              value={settings.liquidity.minWallSizeBtc}
              min={1}
              max={150}
              step={1}
              onChange={(minWallSizeBtc) => set({ liquidity: { minWallSizeBtc } })}
            />
          </Row>
          <Row label="Persistence">
            <Toggle
              checked={settings.liquidity.persistenceEnabled}
              onChange={(persistenceEnabled) =>
                set({ liquidity: { persistenceEnabled } })
              }
            />
          </Row>
          <Row label="Adaptive intensity">
            <Toggle
              checked={settings.liquidity.adaptiveIntensity}
              onChange={(adaptiveIntensity) =>
                set({ liquidity: { adaptiveIntensity } })
              }
            />
          </Row>
        </Section>

        <Section title="Heatmap">
          <Row label="Intensity">
            <select
              value={settings.heatmap.intensityMode}
              onChange={(e) =>
                set({
                  heatmap: {
                    intensityMode: e.target.value as HeatmapIntensityMode,
                  },
                })
              }
              className={inputClass}
            >
              <option value="classic">classic</option>
              <option value="adaptive">adaptive</option>
              <option value="microstructure">microstructure</option>
            </select>
          </Row>
          <Row label={`Opacity ${(settings.heatmap.opacity * 100).toFixed(0)}%`}>
            <Slider
              value={settings.heatmap.opacity}
              min={0.2}
              max={1}
              step={0.02}
              onChange={(opacity) => set({ heatmap: { opacity } })}
            />
          </Row>
          <Row label={`Contrast ${settings.heatmap.contrast.toFixed(2)}`}>
            <Slider
              value={settings.heatmap.contrast}
              min={0.5}
              max={2}
              step={0.05}
              onChange={(contrast) => set({ heatmap: { contrast } })}
            />
          </Row>
        </Section>

        <Section title="DOM / COB">
          <Row label="DOM enabled">
            <Toggle
              checked={settings.dom.enabled}
              onChange={(enabled) => set({ dom: { enabled } })}
            />
          </Row>
          <Row label="Compact mode">
            <Toggle
              checked={settings.dom.compactMode}
              onChange={(compactMode) => set({ dom: { compactMode } })}
            />
          </Row>
          <Row label="Show COB">
            <Toggle
              checked={settings.dom.showCob}
              onChange={(showCob) => set({ dom: { showCob } })}
            />
          </Row>
          <Row label="Bid/ask bars">
            <Toggle
              checked={settings.dom.showBidAskBars}
              onChange={(showBidAskBars) => set({ dom: { showBidAskBars } })}
            />
          </Row>
          <p className="text-[8px] font-mono text-slate-600">
            COB / compact DOM styling — next DOM panel pass.
          </p>
        </Section>

        <Section title="Display">
          <Row label="Historical BBO path">
            <Toggle
              checked={settings.layout.showHistoricalBboPath}
              onChange={(showHistoricalBboPath) =>
                set({ layout: { showHistoricalBboPath } })
              }
            />
          </Row>
          <Row label="BBO path opacity">
            <select
              value={settings.layout.bboPathOpacity}
              disabled={!settings.layout.showHistoricalBboPath}
              onChange={(e) =>
                set({
                  layout: {
                    bboPathOpacity: e.target.value as BidAskLineOpacity,
                  },
                })
              }
              className={inputClass}
            >
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
            </select>
          </Row>
          <Row label="Current BBO lines">
            <Toggle
              checked={settings.layout.showBidAskLines}
              onChange={(showBidAskLines) => set({ layout: { showBidAskLines } })}
            />
          </Row>
          <Row label="B/A line opacity">
            <select
              value={settings.layout.bidAskLineOpacity}
              disabled={!settings.layout.showBidAskLines}
              onChange={(e) =>
                set({
                  layout: {
                    bidAskLineOpacity: e.target.value as BidAskLineOpacity,
                  },
                })
              }
              className={inputClass}
            >
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
            </select>
          </Row>
          <p className="text-[8px] font-mono text-slate-600">
            BBO path uses selected DOM Source in Both mode.
          </p>
        </Section>

        <Section title="Layout">
          <Row label={`Right space ${settings.layout.rightSpacePct}%`}>
            <Slider
              value={settings.layout.rightSpacePct}
              min={10}
              max={35}
              step={1}
              onChange={(rightSpacePct) => set({ layout: { rightSpacePct } })}
            />
          </Row>
          <Row label="Top metrics">
            <Toggle
              checked={settings.layout.showTopMetrics}
              onChange={(showTopMetrics) => set({ layout: { showTopMetrics } })}
            />
          </Row>
          <Row label="Debug panel">
            <Toggle
              checked={settings.layout.showDebug}
              onChange={(showDebug) => set({ layout: { showDebug } })}
            />
          </Row>
        </Section>

        <button
          type="button"
          onClick={onReset}
          className="w-full mt-2 py-1.5 text-[10px] font-mono rounded border border-slate-700 text-slate-400 hover:border-cyan-500/40 hover:text-cyan-200 transition-colors"
        >
          Reset to defaults
        </button>
        <p className="text-[8px] font-mono text-slate-600 mt-2 text-center">
          v1 · {DEFAULT_BOOKMAP_VISUAL_SETTINGS.layout.rightSpacePct}% default right
          space
        </p>
      </div>
    </div>
  );
}
