import { MarketingSectionShell } from "./MarketingSectionShell";
import { StatusBadge } from "./StatusBadge";
import { GammaRegimeBadge } from "./gammaRegimeVisual";
import { cn } from "@/lib/utils";

const TABS = ["Gamma", "Options", "Volatility", "Levels", "Market Mode"] as const;

type LevelKind = "gammaWall" | "localFlip" | "dealerPivot" | "magnet" | "spot" | "accel";

type ChartLevel = {
  y: number;
  label: string;
  kind: LevelKind;
};

/** y = % from top of plot (high price at top). */
const LEVELS: ChartLevel[] = [
  { y: 11, label: "GAMMA WALL", kind: "gammaWall" },
  { y: 24, label: "ACCEL UP", kind: "accel" },
  { y: 34, label: "LOCAL FLIP", kind: "localFlip" },
  { y: 42, label: "SPOT", kind: "spot" },
  { y: 48, label: "DEALER PIVOT", kind: "dealerPivot" },
  { y: 72, label: "MAGNET", kind: "magnet" },
];

/** Shaded bands between levels — yTop/yBottom as % from top */
const SHADED_ZONES = [
  { yTop: 7, yBottom: 17, className: "bg-orange-500/[0.07]" },
  { yTop: 30, yBottom: 38, className: "bg-emerald-500/[0.06]" },
  { yTop: 66, yBottom: 76, className: "bg-blue-500/[0.05]" },
] as const;

/**
 * Mock OHLC — values are % from bottom (price scale).
 * Story: rally → rejection at gamma wall → sell-off → bounce at local flip →
 * rejection at dealer pivot → drift toward magnet (spot on live line).
 */
const CANDLES: [number, number, number, number][] = [
  [38, 44, 46, 36],
  [44, 52, 54, 42],
  [52, 60, 62, 50],
  [60, 68, 70, 58],
  [68, 76, 78, 66],
  [76, 82, 84, 74],
  [82, 78, 89, 77], // rejection at gamma wall — upper wick
  [78, 72, 80, 70],
  [72, 64, 74, 62],
  [64, 56, 66, 54],
  [56, 52, 58, 50], // dealer pivot test
  [52, 54, 56, 49], // pivot hold — small bounce
  [54, 48, 55, 46],
  [48, 42, 50, 40],
  [42, 48, 50, 64], // local flip bounce — long lower wick
  [48, 52, 54, 46],
  [52, 50, 53, 48], // dealer pivot rejection
  [50, 46, 51, 44],
  [46, 42, 48, 40],
  [42, 38, 44, 36],
  [38, 34, 40, 32],
  [34, 30, 36, 28], // approaching magnet
];

const CONTEXT_ROWS = [
  { label: "Gamma regime", value: "Short gamma", isRegime: true as const },
  { label: "Market mode", value: "Defensive · range", tone: "text-[#e5e7eb]" },
  { label: "Global flip", value: "$96,400", tone: "text-violet-300" },
  { label: "Local flip", value: "$94,200", tone: "text-emerald-300" },
  { label: "Dealer pivot", value: "$93,150", tone: "text-[#d1d5db]" },
  { label: "Magnet", value: "$92,800", tone: "text-blue-300" },
] as const;

function levelStyle(kind: LevelKind) {
  switch (kind) {
    case "gammaWall":
      return {
        line: "border-orange-400/90 border-solid shadow-[0_0_14px_rgba(249,115,22,0.35)]",
        width: 2.5,
        label: "border-orange-500/40 bg-orange-500/15 text-orange-200 font-bold",
      };
    case "localFlip":
      return {
        line: "border-emerald-400/80 border-solid",
        width: 2,
        label: "border-emerald-500/35 bg-emerald-500/12 text-emerald-200 font-semibold",
      };
    case "dealerPivot":
      return {
        line: "border-white/20 border-dashed",
        width: 1,
        label: "border-white/10 bg-[#0b0b0b]/95 text-[#9ca3af] font-normal",
      };
    case "magnet":
      return {
        line: "border-blue-400/35 border-dotted",
        width: 1,
        label: "border-blue-500/20 bg-[#0b0b0b]/95 text-blue-300/80 font-normal",
      };
    case "spot":
      return {
        line: "border-[#ff3b3b] border-solid shadow-[0_0_12px_rgba(255,59,59,0.45)] animate-pulse",
        width: 2,
        label: "border-[#ff3b3b]/50 bg-[#ff3b3b]/20 text-[#ff8a8a] font-bold",
      };
    case "accel":
      return {
        line: "border-violet-400/25 border-dashed",
        width: 1,
        label: "border-violet-500/15 bg-[#0b0b0b]/95 text-violet-300/70 font-normal",
      };
  }
}

function MockCandle({
  x,
  open,
  close,
  high,
  low,
  width = 10,
}: {
  x: number;
  open: number;
  close: number;
  high: number;
  low: number;
  width?: number;
}) {
  const bullish = close >= open;
  const bodyTop = Math.min(open, close);
  const bodyBottom = Math.max(open, close);
  const bodyH = Math.max(bodyBottom - bodyTop, 1.4);
  const color = bullish ? "#22c55e" : "#ef4444";
  const wickColor = bullish ? "rgba(34,197,94,0.6)" : "rgba(239,68,68,0.6)";

  return (
    <g>
      <line x1={x} y1={100 - high} x2={x} y2={100 - low} stroke={wickColor} strokeWidth="0.8" />
      <rect
        x={x - width / 2}
        y={100 - bodyTop - bodyH}
        width={width}
        height={bodyH}
        fill={color}
        opacity={0.92}
        rx="0.4"
      />
    </g>
  );
}

function ChartLevelLine({ level }: { level: ChartLevel }) {
  const style = levelStyle(level.kind);

  return (
    <div
      className="pointer-events-none absolute left-0 right-0 z-[2]"
      style={{ top: `${level.y}%` }}
    >
      <div
        className={cn("absolute left-0 right-[4.5rem] border-t", style.line)}
        style={{ borderTopWidth: style.width }}
      />
      <span
        className={cn(
          "absolute right-1.5 -translate-y-1/2 rounded border px-1.5 py-0.5 font-mono text-[7.5px] uppercase tracking-wider",
          style.label,
        )}
      >
        {level.label}
      </span>
    </div>
  );
}

function MockChart() {
  const padX = 3.5;
  const chartW = 100 - padX * 2;
  const step = chartW / CANDLES.length;

  return (
    <div className="relative min-h-[320px] flex-1 overflow-hidden bg-[#0b0b0b] sm:min-h-[360px]">
      <div className="flex h-8 items-center justify-between border-b border-[#1e1e1e] px-3">
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          <span className="font-mono text-[10px] text-[#9ca3af]">BTCUSDT · 15m</span>
          <span className="font-mono text-[10px] font-semibold text-white">$93,420</span>
          <span className="font-mono text-[10px] text-red-400">-0.42%</span>
        </div>
        <span className="font-mono text-[9px] uppercase tracking-wider text-[#6b7280]">
          Gamma overlay ON
        </span>
      </div>

      <div className="relative h-[calc(100%-2rem)] min-h-[280px]">
        {/* Shaded gamma / flip / magnet zones */}
        {SHADED_ZONES.map((zone, i) => (
          <div
            key={i}
            className={cn("pointer-events-none absolute left-0 right-14", zone.className)}
            style={{ top: `${zone.yTop}%`, height: `${zone.yBottom - zone.yTop}%` }}
            aria-hidden
          />
        ))}

        {/* Subtle grid */}
        {[20, 40, 60, 80].map((y) => (
          <div
            key={y}
            className="pointer-events-none absolute left-0 right-14 border-t border-white/[0.03]"
            style={{ top: `${y}%` }}
            aria-hidden
          />
        ))}

        {/* Level lines — render spot last so it sits on top */}
        {[...LEVELS.filter((l) => l.kind !== "spot"), LEVELS.find((l) => l.kind === "spot")!].map(
          (level) => (
            <ChartLevelLine key={level.label} level={level} />
          ),
        )}

        {/* Candles */}
        <svg
          className="absolute inset-0 z-[1] h-full w-full pr-14"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden
        >
          {CANDLES.map(([o, c, h, l], i) => (
            <MockCandle
              key={i}
              x={padX + step * i + step / 2}
              open={o}
              close={c}
              high={h}
              low={l}
              width={Math.min(step * 0.5, 2.8)}
            />
          ))}
        </svg>

        {/* Narrative annotation */}
        <div className="pointer-events-none absolute bottom-3 left-3 z-[3] max-w-[52%] rounded border border-white/[0.08] bg-[#0b0b0b]/85 px-2 py-1.5">
          <p className="font-mono text-[8px] leading-relaxed text-[#9ca3af]">
            <span className="text-orange-300">Rechazo</span> en gamma wall →{" "}
            <span className="text-emerald-300">rebote</span> en local flip →{" "}
            <span className="text-blue-300">deriva</span> hacia magnet
          </p>
        </div>

        <div className="absolute bottom-2 right-1 top-6 z-[3] flex w-11 flex-col justify-between font-mono text-[8px] text-[#6b7280]">
          <span>96.4k</span>
          <span>94.2k</span>
          <span>93.4k</span>
          <span>92.8k</span>
          <span>90.0k</span>
        </div>
      </div>
    </div>
  );
}

/** Static mock UI — no terminal components or live data. */
export function TerminalPreview() {
  return (
    <MarketingSectionShell
      className="py-16 sm:py-20"
      title="Una terminal diseñada para contexto, timing y ejecución"
      subtitle="Definí el régimen con gamma, ubicá zonas críticas en el gráfico y practicá escenarios con paper trading desde la Terminal Web."
    >
      <p className="-mt-6 mb-8 max-w-3xl text-sm text-[#6b7280]">
        GoodTrading integra gamma y niveles directamente sobre el gráfico para tomar decisiones
        operativas sin salir del entorno web.
      </p>

      <div className="relative overflow-hidden rounded-[22px] border border-[#1e1e1e] bg-[#0b0b0b] shadow-[0_24px_80px_rgba(0,0,0,0.45)]">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[#ff3b3b]/4 via-transparent to-violet-600/6" />

        <div className="relative flex flex-wrap items-center justify-between gap-3 border-b border-[#1e1e1e] bg-[#111111] px-3 py-2 sm:px-4">
          <nav className="flex flex-wrap gap-0.5">
            {TABS.map((tab, i) => (
              <span
                key={tab}
                className={cn(
                  "border-b-2 px-2.5 py-1.5 font-mono text-[10px] font-medium uppercase tracking-wide sm:text-[11px]",
                  i === 0
                    ? "border-[#ff3b3b] text-white"
                    : "border-transparent text-[#6b7280]",
                )}
              >
                {tab}
              </span>
            ))}
          </nav>
          <StatusBadge variant="soon" className="normal-case tracking-normal">
            Preview conceptual
          </StatusBadge>
        </div>

        <div className="relative grid lg:grid-cols-[1fr_240px]">
          <MockChart />

          <aside className="border-t border-[#1e1e1e] bg-[#111111]/95 p-3 lg:border-l lg:border-t-0">
            <p className="mb-3 font-mono text-[9px] font-semibold uppercase tracking-[0.2em] text-[#6b7280]">
              Contexto operativo
            </p>
            <div className="space-y-2">
              {CONTEXT_ROWS.map((row) => (
                <div
                  key={row.label}
                  className="rounded border border-[#1e1e1e] bg-[#0b0b0b]/80 px-2.5 py-2"
                >
                  <p className="font-mono text-[9px] uppercase tracking-wide text-[#6b7280]">
                    {row.label}
                  </p>
                  {"isRegime" in row && row.isRegime ? (
                    <GammaRegimeBadge value={row.value} />
                  ) : (
                    <p className={cn("mt-0.5 text-xs font-medium", "tone" in row ? row.tone : "")}>
                      {row.value}
                    </p>
                  )}
                </div>
              ))}
            </div>
            <div className="mt-3 rounded border border-[#ff3b3b]/25 bg-[#ff3b3b]/8 px-2.5 py-2">
              <p className="font-mono text-[9px] uppercase tracking-wide text-[#ff8a8a]">
                Escenario activo
              </p>
              <p className="mt-0.5 text-xs font-medium leading-relaxed text-[#fca5a5]">
                Pullback post-rechazo en gamma wall. Rebote en local flip y deriva controlada hacia
                magnet bajo{" "}
                <span className="font-semibold text-red-300/95">short gamma</span>.
              </p>
              <p className="mt-1.5 font-mono text-[9px] text-[#9ca3af]">
                Timing: confirmar en dealer pivot o ejecutar hacia magnet
              </p>
            </div>
          </aside>
        </div>
      </div>
    </MarketingSectionShell>
  );
}
