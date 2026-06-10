import { useMemo, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { useTerminalState } from "@/hooks/useTerminalState";
import { apiUrl } from "@/lib/apiBase";
import { buildMarketCandlesUrl } from "@shared/candleLimits";
import {
  calculateVolatilityEngine,
  normalizeVolatilityCandles,
} from "@/lib/volatilityEngine";
import { refineVolatilityWithGamma } from "@/lib/volatilityGammaInterpretation";
import { refineVolatilityWithLiquidity } from "@/lib/volatilityLiquidityInterpretation";
import { refineVolatilityWithConflictResolution } from "@/lib/volatilityConflictResolution";
import { refineVolatilityWithPlaybook } from "@/lib/volatilityPlaybookEngine";
import { normalizeLiquidityContext } from "@/lib/normalizeLiquidityContext";
import { mapVolatilityEngineToPanelState } from "@/lib/volatilityEnginePanelMap";

import type {
  VolMarketEnergyState,
  VolTriggerZone,
  VolatilityEngineState,
} from "@/lib/volatilityEnginePanelTypes";

export type {
  VolMarketEnergyState,
  VolExpansionRiskLevel,
  VolTradeQuality,
  VolReversalWatch,
  VolDirectionalBias,
  VolActionMode,
  VolTriggerZone,
  VolExpectedMoveRow,
  VolatilityEngineState,
} from "@/lib/volatilityEnginePanelTypes";

const PANEL_MAX_WIDTH = "max-w-[1240px]";
const VOL_CANDLE_LIMIT = 200;

function formatLevel(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function formatMovePts(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return `±${n.toLocaleString("en-US")}`;
}

async function fetchVolEngineCandles(): Promise<ReturnType<typeof normalizeVolatilityCandles>> {
  const url = buildMarketCandlesUrl("BTCUSDT", "15m", VOL_CANDLE_LIMIT);
  const res = await fetch(apiUrl(url));
  if (!res.ok) return [];
  const raw = await res.json().catch(() => []);
  return normalizeVolatilityCandles(raw);
}

function ProgressBar({
  value,
  className,
  height = "h-2",
  barClassName,
}: {
  value: number;
  className?: string;
  height?: string;
  barClassName?: string;
}) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div
      className={cn(
        "w-full border border-terminal-border bg-[#0a0a0a]",
        height,
        className,
      )}
    >
      <div
        className={cn("h-full transition-all duration-300", barClassName ?? "bg-terminal-accent")}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function SectionCard({
  title,
  children,
  className,
  bodyClassName,
}: {
  title: string;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section
      className={cn(
        "border border-terminal-border bg-terminal-panel flex flex-col min-h-0",
        className,
      )}
    >
      <header className="px-3 py-2 border-b border-terminal-border shrink-0">
        <h3 className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-300">
          {title}
        </h3>
      </header>
      <div className={cn("p-3 flex flex-col gap-3 flex-1 min-h-0", bodyClassName)}>
        {children}
      </div>
    </section>
  );
}

function ExecutiveBanner({ headline, subtext }: VolatilityEngineState["executive"]) {
  return (
    <div className="border border-terminal-accent/50 bg-[#0c0808] px-4 py-4 md:px-5 md:py-5">
      <p className="text-[13px] md:text-sm font-bold uppercase tracking-[0.08em] leading-snug text-white">
        {headline}
      </p>
      <p className="mt-2 text-[11px] md:text-[12px] leading-relaxed text-slate-400 max-w-3xl">
        {subtext}
      </p>
    </div>
  );
}

function riskAccent(level: string, kind: "trade" | "clean"): string {
  if (level === "EXTREME" || level === "HIGH") {
    return kind === "trade" ? "text-terminal-accent" : "text-amber-300";
  }
  if (level === "MEDIUM") return "text-amber-200";
  return "text-slate-300";
}

function StatusStrip({ state }: { state: VolatilityEngineState["status"] }) {
  const segments: {
    label: string;
    value: string;
    valueClass: string;
  }[] = [
    {
      label: "VOL STATE",
      value: state.volState,
      valueClass: "text-amber-200",
    },
    {
      label: "CLEAN EXPANSION",
      value: state.cleanExpansion,
      valueClass: riskAccent(state.cleanExpansion, "clean"),
    },
    {
      label: "TRADE RISK",
      value: state.tradeRisk,
      valueClass: riskAccent(state.tradeRisk, "trade"),
    },
    {
      label: "BIAS",
      value: state.bias,
      valueClass: "text-amber-300",
    },
    {
      label: "ACTION",
      value: state.action,
      valueClass: "text-terminal-accent",
    },
  ];

  return (
    <div className="flex flex-col gap-1.5">
      <div className="border border-terminal-border bg-[#0a0a0a] divide-y divide-terminal-border lg:divide-y-0 lg:flex lg:divide-x lg:flex-wrap">
        {segments.map((seg) => (
          <div
            key={seg.label}
            className="flex-1 min-w-[118px] px-3 py-2.5 flex flex-col gap-0.5"
          >
            <span className="text-[9px] font-mono uppercase tracking-[0.14em] text-slate-500 leading-tight">
              {seg.label}
            </span>
            <span
              className={cn(
                "text-[11px] sm:text-[12px] font-mono font-bold tracking-wide",
                seg.valueClass,
              )}
            >
              {seg.value}
            </span>
          </div>
        ))}
      </div>
      <p className="text-[10px] font-mono uppercase tracking-[0.12em] text-slate-500 px-1">
        <span className="text-slate-600">Summary: </span>
        <span className="text-slate-300 font-semibold">{state.riskSummary}</span>
      </p>
      {state.gammaStripTag ? (
        <p className="text-[10px] font-mono uppercase tracking-[0.1em] text-cyan-300/80 px-1 border-l-2 border-cyan-500/40 pl-2">
          {state.gammaStripTag}
        </p>
      ) : null}
      {state.liquidityStripTag ? (
        <p className="text-[10px] font-mono uppercase tracking-[0.1em] text-violet-300/80 px-1 border-l-2 border-violet-500/40 pl-2">
          {state.liquidityStripTag}
        </p>
      ) : null}
      {state.conflictStripTag ? (
        <p className="text-[10px] font-mono uppercase tracking-[0.08em] text-amber-200/85 px-1 border-l-2 border-amber-500/45 pl-2 leading-relaxed">
          {state.conflictStripTag}
        </p>
      ) : null}
    </div>
  );
}

function MetricChip({
  label,
  value,
  variant = "neutral",
}: {
  label: string;
  value: string;
  variant?: "neutral" | "warn" | "danger" | "info";
}) {
  const styles = {
    neutral: "border-slate-600/50 text-slate-300 bg-slate-900/50",
    warn: "border-amber-500/40 text-amber-200 bg-amber-950/25",
    danger: "border-terminal-accent/40 text-red-200 bg-terminal-accent/8",
    info: "border-cyan-600/40 text-cyan-200/90 bg-cyan-950/20",
  };
  return (
    <div
      className={cn(
        "flex-1 min-w-[130px] border px-2.5 py-2 flex flex-col gap-0.5",
        styles[variant],
      )}
    >
      <span className="text-[9px] uppercase tracking-wide text-slate-500">{label}</span>
      <span className="text-[11px] font-mono font-bold uppercase">{value}</span>
    </div>
  );
}

function chipVariantForRisk(level: string): "neutral" | "warn" | "danger" {
  if (level === "EXTREME" || level === "HIGH") return "danger";
  if (level === "MEDIUM") return "warn";
  return "neutral";
}

function reversalChipVariant(watch: string): "neutral" | "warn" | "info" {
  if (watch === "HIGH") return "warn";
  if (watch === "ACTIVE") return "info";
  return "neutral";
}

function TradeQualitySection({
  tradeQuality,
}: {
  tradeQuality: VolatilityEngineState["tradeQuality"];
}) {
  const qualityStyles: Record<string, string> = {
    EXCELLENT: "text-emerald-400 border-emerald-500/40",
    GOOD: "text-emerald-300/90 border-emerald-500/30",
    LOW: "text-amber-300 border-amber-500/35",
    "NO TRADE": "text-terminal-accent border-terminal-accent/40",
  };

  return (
    <SectionCard title="Trade Quality" className="lg:col-span-2">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <span className="text-[10px] uppercase tracking-wide text-slate-500 block mb-1">
            Trade Quality
          </span>
          <span
            className={cn(
              "inline-block text-lg font-mono font-bold uppercase tracking-wide border px-3 py-1",
              qualityStyles[tradeQuality.label] ?? qualityStyles.LOW,
            )}
          >
            {tradeQuality.label}
          </span>
        </div>
        <div className="text-right">
          <span className="text-[10px] uppercase tracking-wide text-slate-500 block mb-1">
            Score
          </span>
          <span className="text-xl font-mono font-bold tabular-nums text-slate-100">
            {tradeQuality.score}
            <span className="text-sm text-slate-500 font-normal">/100</span>
          </span>
        </div>
      </div>
      {tradeQuality.reasons.length > 0 && (
        <ul className="text-[11px] text-slate-400 space-y-1 border-t border-terminal-border/60 pt-2 mt-1">
          {tradeQuality.reasons.map((reason) => (
            <li key={reason} className="flex gap-2">
              <span className="text-slate-600 shrink-0">—</span>
              <span>{reason}</span>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

function EnergyStateBadge({ state }: { state: VolMarketEnergyState }) {
  const tones: Record<VolMarketEnergyState, string> = {
    COMPRESSED: "text-cyan-300 border-cyan-500/40 bg-cyan-500/10",
    LOADED: "text-amber-100 border-amber-500/45 bg-amber-500/15",
    EXPANDING: "text-orange-300 border-orange-500/45 bg-orange-500/10",
    EXHAUSTED: "text-slate-300 border-slate-500/40 bg-slate-500/10",
  };
  return (
    <div
      className={cn(
        "inline-flex items-center justify-center px-4 py-2.5 border-2 font-mono font-bold uppercase tracking-[0.14em] text-base md:text-lg",
        tones[state],
      )}
    >
      {state}
    </div>
  );
}

function ReasonTags({ tags }: { tags: string[] }) {
  if (!tags?.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {tags.map((tag) => (
        <span
          key={tag}
          className="px-2 py-0.5 text-[10px] font-mono uppercase tracking-wide border border-slate-600/50 bg-slate-900/60 text-cyan-200/80"
        >
          {tag}
        </span>
      ))}
    </div>
  );
}

function TriggerZoneRow({ zone }: { zone: VolTriggerZone }) {
  const toneStyles = {
    upside: {
      border: "border-l-emerald-500/80",
      level: "text-emerald-100",
      actionLabel: "text-emerald-500/90",
    },
    downside: {
      border: "border-l-red-500/80",
      level: "text-red-100",
      actionLabel: "text-red-400/90",
    },
    neutral: {
      border: "border-l-slate-400/70",
      level: "text-slate-100",
      actionLabel: "text-slate-400",
    },
  };
  const tone = toneStyles[zone.tone];

  return (
    <div
      className={cn(
        "border border-terminal-border border-l-[3px] bg-[#0c0c0c] px-3 py-3 flex flex-col gap-2 h-full",
        tone.border,
      )}
    >
      <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400 leading-tight">
        {zone.label}
      </span>
      <span className={cn("text-xl font-mono font-bold tabular-nums leading-none", tone.level)}>
        {formatLevel(zone.level)}
      </span>
      <p className="text-[11px] leading-relaxed text-slate-400 flex-1">{zone.description}</p>
      <p className="text-[10px] leading-snug border-t border-terminal-border/60 pt-2">
        <span className={cn("font-bold uppercase tracking-wide", tone.actionLabel)}>Action: </span>
        <span className="text-slate-300">{zone.action}</span>
      </p>
      {zone.confirmation && zone.id !== "magnet" ? (
        <p className="text-[10px] font-mono uppercase tracking-wide text-slate-500">
          Confirmation:{" "}
          <span
            className={cn(
              "font-semibold",
              zone.confirmation === "STRONG"
                ? "text-emerald-400"
                : zone.confirmation === "MODERATE"
                  ? "text-cyan-300"
                  : zone.confirmation === "WEAK"
                    ? "text-amber-300/90"
                    : "text-slate-500",
            )}
          >
            {zone.confirmation}
          </span>
        </p>
      ) : null}
    </div>
  );
}

function KeyValueRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5 border-b border-terminal-border/60 last:border-0">
      <span className="text-[10px] uppercase tracking-wide text-slate-500 shrink-0">{label}</span>
      <span className="text-[11px] font-mono font-semibold text-right text-slate-100">{value}</span>
    </div>
  );
}

function scenarioStatusStyles(status: string): {
  badge: string;
  border: string;
} {
  if (status === "ACTIVE") {
    return {
      badge: "text-emerald-300 border-emerald-500/50 bg-emerald-950/30",
      border: "border-l-emerald-500/80",
    };
  }
  if (status === "WAITING") {
    return {
      badge: "text-amber-200 border-amber-500/45 bg-amber-950/25",
      border: "border-l-amber-500/70",
    };
  }
  if (status === "BLOCKED") {
    return {
      badge: "text-orange-300 border-orange-500/45 bg-orange-950/25",
      border: "border-l-orange-500/75",
    };
  }
  return {
    badge: "text-slate-400 border-slate-600/50 bg-slate-900/50",
    border: "border-l-slate-500/60",
  };
}

function ScenarioPlaybookCard({
  title,
  scenario,
}: {
  title: string;
  scenario: VolatilityEngineState["operationalPlaybook"]["upsideScenario"];
}) {
  const styles = scenarioStatusStyles(scenario.scenarioStatus);
  return (
    <div
      className={cn(
        "border border-terminal-border border-l-[3px] bg-[#0c0c0c] p-3 flex flex-col gap-2.5 min-h-[160px]",
        styles.border,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
          {title}
        </span>
        <span
          className={cn(
            "text-[9px] font-mono font-bold uppercase px-2 py-0.5 border",
            styles.badge,
          )}
        >
          {scenario.scenarioStatus}
        </span>
      </div>
      <p className="text-[11px] leading-relaxed text-slate-300">{scenario.condition}</p>
      <p className="text-[10px] leading-snug text-slate-400 border-l border-cyan-600/40 pl-2">
        <span className="text-slate-500 uppercase text-[9px] block mb-0.5">Activation Trigger</span>
        {scenario.activationTrigger}
      </p>
      <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[10px] font-mono">
        <span className="text-slate-500 uppercase">Confirmation</span>
        <span className="text-cyan-200/90 text-right font-semibold">{scenario.confirmation}</span>
      </div>
      {scenario.blockingReasons.length > 0 ? (
        <div>
          <span className="text-[9px] uppercase text-slate-500 block mb-1">Blocking</span>
          <ul className="space-y-0.5">
            {scenario.blockingReasons.slice(0, 3).map((r) => (
              <li
                key={r}
                className="text-[10px] text-orange-200/85 leading-snug pl-1.5 border-l border-orange-500/40"
              >
                {r}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-[10px] font-mono mt-auto">
        <span className="text-slate-500">T1</span>
        <span className="text-slate-200 text-right">{scenario.targetPrimary}</span>
        {scenario.targetSecondary !== "—" ? (
          <>
            <span className="text-slate-500">T2</span>
            <span className="text-slate-300 text-right">{scenario.targetSecondary}</span>
          </>
        ) : null}
        {scenario.targetExtended !== "—" ? (
          <>
            <span className="text-slate-500">EXT</span>
            <span className="text-slate-400 text-right">{scenario.targetExtended}</span>
          </>
        ) : null}
        <span className="text-slate-500 col-span-2 uppercase mt-1">Invalidation</span>
        <span className="text-slate-400 col-span-2 leading-snug">{scenario.invalidation}</span>
      </div>
    </div>
  );
}

function OperationalPlaybookSection({
  playbook,
}: {
  playbook: VolatilityEngineState["operationalPlaybook"];
}) {
  const modeStyles: Record<string, string> = {
    "NO TRADE": "text-terminal-accent border-terminal-accent/45 bg-terminal-accent/10",
    "WAIT TRIGGER": "text-amber-200 border-amber-500/45 bg-amber-950/25",
    "WAIT CONFIRMATION": "text-amber-200 border-amber-500/40 bg-amber-950/20",
    CONTINUATION: "text-emerald-300 border-emerald-500/45 bg-emerald-950/25",
    "REVERSAL WATCH": "text-cyan-200 border-cyan-500/40 bg-cyan-950/20",
    "RANGE CHOP": "text-slate-300 border-slate-500/45 bg-slate-900/50",
  };

  return (
    <SectionCard
      title="Operational Playbook"
      className="lg:col-span-2 border-2 border-amber-600/35 bg-[#0a0a0a]"
      bodyClassName="p-4 gap-4"
    >
      <div className="flex flex-wrap items-start gap-3 border-b border-terminal-border pb-3">
        <span
          className={cn(
            "text-[10px] font-mono font-bold uppercase tracking-[0.14em] px-2.5 py-1 border shrink-0",
            modeStyles[playbook.mode] ?? modeStyles["NO TRADE"],
          )}
        >
          {playbook.mode}
        </span>
        <p className="text-[13px] font-bold uppercase tracking-[0.06em] text-slate-50 leading-snug flex-1 min-w-[200px]">
          {playbook.headline}
        </p>
      </div>
      <p className="text-[12px] leading-relaxed text-slate-400">{playbook.summary}</p>
      <div className="border border-terminal-border bg-[#0c0c0c] px-3 py-2.5">
        <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-amber-400/90 block mb-1">
          Current Action
        </span>
        <p className="text-[12px] font-semibold text-slate-100 leading-relaxed">
          {playbook.currentAction}
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <ScenarioPlaybookCard title="Upside Scenario" scenario={playbook.upsideScenario} />
        <ScenarioPlaybookCard title="Downside Scenario" scenario={playbook.downsideScenario} />
      </div>
      <div>
        <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-terminal-accent/90 block mb-2">
          Avoid
        </span>
        <ul className="space-y-1">
          {playbook.avoid.map((rule) => (
            <li
              key={rule}
              className="text-[11px] text-slate-300 leading-snug pl-2 border-l-2 border-terminal-accent/35"
            >
              {rule}
            </li>
          ))}
        </ul>
      </div>
      <p className="text-[11px] font-mono uppercase tracking-[0.1em] text-cyan-200/90 border border-cyan-600/35 bg-cyan-950/20 px-3 py-2.5">
        {playbook.nextCheckpoint}
      </p>
    </SectionCard>
  );
}

function PlaybookBlock({
  label,
  text,
  variant,
}: {
  label: string;
  text: string;
  variant: "play" | "avoid" | "invalidate";
}) {
  const styles = {
    play: "border-2 border-emerald-500/40 bg-emerald-950/30",
    avoid: "border-2 border-terminal-accent/45 bg-terminal-accent/8",
    invalidate: "border-2 border-slate-500/50 bg-slate-900/50",
  };
  const labelColors = {
    play: "text-emerald-400",
    avoid: "text-terminal-accent",
    invalidate: "text-slate-300",
  };
  const textColors = {
    play: "text-emerald-50",
    avoid: "text-red-50",
    invalidate: "text-slate-200",
  };

  return (
    <div className={cn("px-4 py-4 flex flex-col gap-2 min-h-[120px]", styles[variant])}>
      <div
        className={cn(
          "text-[11px] font-bold uppercase tracking-[0.14em]",
          labelColors[variant],
        )}
      >
        {label}
      </div>
      <p className={cn("text-[13px] leading-relaxed font-semibold flex-1", textColors[variant])}>
        {text}
      </p>
    </div>
  );
}

function InterpretationBlock({ children }: { children: ReactNode }) {
  return (
    <p className="text-[11px] leading-relaxed text-slate-400 border border-terminal-border/60 bg-[#0a0a0a] px-3 py-2.5">
      {children}
    </p>
  );
}

export function VolatilityEnginePanel() {
  const { data: terminalState } = useTerminalState();

  const spot =
    typeof terminalState?.ticker?.price === "number"
      ? terminalState.ticker.price
      : undefined;

  const { data: candles = [] } = useQuery({
    queryKey: ["vol-engine-candles", "BTCUSDT", "15m", VOL_CANDLE_LIMIT],
    queryFn: fetchVolEngineCandles,
    refetchInterval: 60_000,
    staleTime: 30_000,
    retry: 1,
  });

  const { volState, dataLive, gammaIntegrated, liquidityIntegrated } = useMemo(() => {
    const base = calculateVolatilityEngine({
      candles,
      spot,
      symbol: "BTCUSDT",
      timeframe: "15m",
    });
    const { output: afterGamma, gamma } = refineVolatilityWithGamma(base, terminalState, spot);
    const liquidityCtx = normalizeLiquidityContext(terminalState, spot);
    const { output: afterLiquidity, liquidity } = refineVolatilityWithLiquidity(
      afterGamma,
      liquidityCtx,
      spot,
      gamma,
    );
    const afterConflict = refineVolatilityWithConflictResolution(afterLiquidity, {
      liquidity: liquidityCtx,
      gamma,
    });
    const output = refineVolatilityWithPlaybook(afterConflict, {
      liquidity: liquidityCtx,
      gamma,
      terminal: terminalState,
      spot,
    });
    return {
      volState: mapVolatilityEngineToPanelState(output, terminalState, gamma, liquidity),
      dataLive: output.computedFromCandles,
      gammaIntegrated: gamma.gammaIntegrated,
      liquidityIntegrated: liquidity.liquidityIntegrated,
    };
  }, [candles, spot, terminalState]);

  const {
    executive,
    status,
    marketEnergy,
    directionalPressure,
    triggerZones,
    expectedMove,
    tradeQuality,
    volContext,
    operationalPlaybook,
    finalPlaybook,
  } = volState;

  return (
    <div className="w-full h-full min-h-0 flex flex-col overflow-hidden bg-terminal-bg text-terminal-text">
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
        <div
          className={cn(
            "mx-auto w-full px-4 sm:px-6 pt-5 sm:pt-6 pb-24 sm:pb-28 flex flex-col gap-4",
            PANEL_MAX_WIDTH,
          )}
        >
          {/* Header */}
          <header className="shrink-0 border-b border-terminal-border pb-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <h1 className="text-lg sm:text-xl font-bold uppercase tracking-[0.1em] text-slate-50 leading-tight">
                  VOLATILITY ENGINE
                </h1>
                <p className="text-[11px] sm:text-xs text-slate-500 mt-1.5 font-mono leading-relaxed">
                  Market energy, expansion risk and trigger zones
                </p>
              </div>
              <div className="flex flex-col items-end gap-1.5 shrink-0">
                <span className="text-[9px] font-mono uppercase tracking-[0.18em] text-slate-400 border border-terminal-border bg-terminal-panel px-2.5 py-1.5">
                  PHASE 5 · PLAYBOOK VOL ENGINE
                </span>
                <div className="flex flex-wrap justify-end gap-1.5">
                  <span
                    className={cn(
                      "text-[9px] font-mono uppercase tracking-[0.14em] px-2 py-0.5 border",
                      dataLive
                        ? "text-emerald-400/90 border-emerald-500/40 bg-emerald-950/30"
                        : "text-amber-400/90 border-amber-500/40 bg-amber-950/30",
                    )}
                  >
                    DATA: {dataLive ? "LIVE" : "FALLBACK"}
                  </span>
                  <span
                    className={cn(
                      "text-[9px] font-mono uppercase tracking-[0.14em] px-2 py-0.5 border",
                      gammaIntegrated
                        ? "text-cyan-300/90 border-cyan-500/40 bg-cyan-950/25"
                        : "text-slate-500 border-terminal-border bg-terminal-panel",
                    )}
                  >
                    GAMMA: {gammaIntegrated ? "LIVE" : "OFFLINE"}
                  </span>
                  <span
                    className={cn(
                      "text-[9px] font-mono uppercase tracking-[0.14em] px-2 py-0.5 border",
                      liquidityIntegrated
                        ? "text-violet-300/90 border-violet-500/40 bg-violet-950/25"
                        : "text-slate-500 border-terminal-border bg-terminal-panel",
                    )}
                  >
                    LIQUIDITY: {liquidityIntegrated ? "LIVE" : "OFFLINE"}
                  </span>
                </div>
              </div>
            </div>
          </header>

          <ExecutiveBanner {...executive} />
          <StatusStrip state={status} />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 md:gap-4">
            {/* A — Market Energy */}
            <SectionCard title="Market Energy">
              <EnergyStateBadge state={marketEnergy.state} />
              <p className="text-[12px] leading-relaxed text-slate-300">{marketEnergy.summary}</p>
              <ReasonTags tags={marketEnergy.tags} />
              <div className="pt-1">
                <div className="flex justify-between items-baseline mb-2 gap-2">
                  <span className="text-[10px] uppercase tracking-wide text-slate-500">
                    Clean expansion risk
                  </span>
                  <span className="text-sm font-mono font-bold text-terminal-accent tabular-nums shrink-0">
                    {marketEnergy.cleanExpansionRiskPct}%
                  </span>
                </div>
                <ProgressBar
                  value={marketEnergy.cleanExpansionRiskPct}
                  height="h-3"
                  barClassName="bg-gradient-to-r from-amber-700/90 via-amber-500/80 to-terminal-accent"
                />
              </div>
              <div className="flex flex-wrap gap-2 pt-1">
                <MetricChip
                  label="Late Chase Risk"
                  value={marketEnergy.lateChaseRisk}
                  variant={chipVariantForRisk(marketEnergy.lateChaseRisk)}
                />
                <MetricChip
                  label="Reversal Watch"
                  value={marketEnergy.reversalWatch}
                  variant={reversalChipVariant(marketEnergy.reversalWatch)}
                />
              </div>
            </SectionCard>

            {/* B — Directional Vol Pressure */}
            <SectionCard title="Directional Vol Pressure">
              <span className="text-sm md:text-base font-mono font-bold uppercase tracking-wide text-amber-200">
                {directionalPressure.pressure}
              </span>
              <p className="text-[12px] leading-relaxed text-slate-300">
                {directionalPressure.summary}
              </p>
              <p className="text-[11px] font-medium text-amber-400/90 border-l-2 border-amber-500/50 pl-2.5">
                {directionalPressure.warning}
              </p>
              <ReasonTags tags={directionalPressure.tags} />
            </SectionCard>

            {/* C — Trigger Zones */}
            <SectionCard title="Volatility Trigger Zones" className="lg:col-span-2">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {triggerZones.map((zone) => (
                  <TriggerZoneRow key={zone.id} zone={zone} />
                ))}
              </div>
            </SectionCard>

            {/* D — Expected Move */}
            <SectionCard title="Expected Move">
              <div className="grid grid-cols-4 gap-1.5 sm:gap-2">
                {expectedMove.rows.map((row) => (
                  <div
                    key={row.horizon}
                    className="border border-terminal-border bg-[#0c0c0c] px-1.5 sm:px-2 py-2 text-center min-w-0"
                  >
                    <div className="text-[9px] sm:text-[10px] uppercase tracking-wide text-slate-500 truncate">
                      {row.horizon}
                    </div>
                    <span className="text-sm sm:text-base font-mono font-bold tabular-nums text-slate-50 block mt-0.5">
                      {formatMovePts(row.points)}
                    </span>
                  </div>
                ))}
              </div>
              <div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">
                    Move Used: {expectedMove.moveUsedPct}%
                  </span>
                </div>
                <ProgressBar
                  value={expectedMove.moveUsedPct}
                  height="h-2.5"
                  barClassName="bg-cyan-600/75"
                />
              </div>
              <InterpretationBlock>{expectedMove.interpretation}</InterpretationBlock>
            </SectionCard>

            {/* E — Gamma / Vol Context */}
            <SectionCard title={volContext.sectionTitle} className="lg:col-span-2">
              <div className="flex flex-wrap items-center justify-end gap-2 mb-1">
                <span
                  className={cn(
                    "text-[9px] font-mono uppercase tracking-[0.12em] px-2 py-0.5 border",
                    volContext.gammaIntegrated
                      ? "text-cyan-300/90 border-cyan-500/40 bg-cyan-950/25"
                      : "text-slate-500 border-terminal-border bg-terminal-panel",
                  )}
                >
                  GAMMA: {volContext.gammaIntegrated ? "LIVE" : "OFFLINE"}
                </span>
                <span
                  className={cn(
                    "text-[9px] font-mono uppercase tracking-[0.12em] px-2 py-0.5 border",
                    volContext.liquidityIntegrated
                      ? "text-violet-300/90 border-violet-500/40 bg-violet-950/25"
                      : "text-slate-500 border-terminal-border bg-terminal-panel",
                  )}
                >
                  LIQUIDITY: {volContext.liquidityIntegrated ? "LIVE" : "OFFLINE"}
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-0">
                <KeyValueRow label="Gamma Regime" value={volContext.gammaRegime} />
                <KeyValueRow label="Dealer Behavior" value={volContext.dealerBehavior} />
                <KeyValueRow label="Liquidity Regime" value={volContext.liquidityRegime} />
                <KeyValueRow label="Heatmap Pressure" value={volContext.heatmapPressure} />
                <KeyValueRow
                  label="Nearest Liquidity Level"
                  value={volContext.nearestLiquidityLevel}
                />
                <KeyValueRow
                  label="Orderflow Confirmation"
                  value={volContext.orderflowConfirmation}
                />
                <KeyValueRow label="Expected Behavior" value={volContext.expectedBehavior} />
                <KeyValueRow label="Candle Regime" value={volContext.volRegime} />
              </div>
              <div className="mt-2 pt-2 border-t border-terminal-border/70">
                <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-slate-500 mb-2">
                  Decision Context
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-0">
                  <KeyValueRow label="Signal Alignment" value={volContext.signalAlignment} />
                  <KeyValueRow label="Resolution State" value={volContext.resolutionState} />
                  <KeyValueRow label="Primary Conflict" value={volContext.primaryConflict} />
                  <KeyValueRow label="Resolution Hint" value={volContext.resolutionHint} />
                </div>
              </div>
              {volContext.nearestGammaLevel?.detail ? (
                <p className="text-[10px] text-slate-500 border-l-2 border-cyan-600/40 pl-2">
                  {volContext.nearestGammaLevel.detail}
                </p>
              ) : null}
              <InterpretationBlock>{volContext.interpretation}</InterpretationBlock>
              {volContext.gammaIntegrated && volContext.levelsCompact !== "—" ? (
                <p className="text-[10px] font-mono text-slate-500 leading-relaxed">
                  <span className="text-slate-600">Gamma Levels: </span>
                  {volContext.levelsCompact}
                </p>
              ) : null}
              {volContext.gammaIntegrated && volContext.magnetsCompact !== "—" ? (
                <p className="text-[10px] font-mono text-slate-500 leading-relaxed">
                  <span className="text-slate-600">Gamma Magnets: </span>
                  {volContext.magnetsCompact}
                </p>
              ) : null}
              {volContext.liquidityIntegrated && volContext.liquidityCompact !== "—" ? (
                <p className="text-[10px] font-mono text-slate-500 leading-relaxed">
                  <span className="text-slate-600">Liquidity: </span>
                  {volContext.liquidityCompact}
                </p>
              ) : null}
              {volContext.liquidityIntegrated && volContext.flowCompact !== "—" ? (
                <p className="text-[10px] font-mono text-slate-500 leading-relaxed">
                  <span className="text-slate-600">Flow: </span>
                  {volContext.flowCompact}
                </p>
              ) : null}
            </SectionCard>

            <TradeQualitySection tradeQuality={tradeQuality} />

            <OperationalPlaybookSection playbook={operationalPlaybook} />

            {/* F — Best Play / Avoid */}
            <SectionCard
              title="Best Play / Avoid"
              className="lg:col-span-2 border-terminal-accent/25"
              bodyClassName="p-4 gap-4 bg-[#080808]"
            >
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <PlaybookBlock label="Best Play" text={finalPlaybook.bestPlay} variant="play" />
                <PlaybookBlock label="Avoid" text={finalPlaybook.avoid} variant="avoid" />
                <PlaybookBlock
                  label="Invalidation"
                  text={finalPlaybook.invalidation}
                  variant="invalidate"
                />
              </div>
              <p className="text-center text-[11px] font-mono uppercase tracking-[0.12em] text-slate-400 border-t border-terminal-border pt-3">
                <span className="text-slate-500">Execution rule: </span>
                <span className="text-slate-200 font-semibold">{finalPlaybook.executionRule}</span>
              </p>
            </SectionCard>
          </div>
        </div>
      </div>
    </div>
  );
}
