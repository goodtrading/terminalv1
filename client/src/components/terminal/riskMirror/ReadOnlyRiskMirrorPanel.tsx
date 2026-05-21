import { cn } from "@/lib/utils";
import type {
  ReadOnlyRiskMirrorSnapshot,
  RiskMirrorScoreStatus,
} from "./riskMirrorTypes";
import { useBingXReadOnlyRiskMirror } from "./useBingXReadOnlyRiskMirror";

function fmtPrice(n: number | undefined): string {
  if (n == null || !Number.isFinite(n)) return "--";
  return n >= 1000 ? n.toFixed(1) : n.toFixed(2);
}

function fmtPct(n: number | undefined, suffix = "%"): string {
  if (n == null || !Number.isFinite(n)) return "unavailable";
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}${suffix}`;
}

function gammaStateLabel(s: string | undefined): string {
  if (!s || s === "unknown") return "Context unavailable";
  return s.replace(/_/g, " ").toUpperCase();
}

const SCORE_STYLES: Record<
  RiskMirrorScoreStatus,
  { border: string; text: string; label: string }
> = {
  aligned: {
    border: "border-emerald-500/40",
    text: "text-emerald-300",
    label: "ALIGNED",
  },
  neutral: {
    border: "border-slate-500/40",
    text: "text-slate-300",
    label: "NEUTRAL",
  },
  conflicted: {
    border: "border-amber-500/45",
    text: "text-amber-300",
    label: "CONFLICTED",
  },
  danger: {
    border: "border-red-500/50",
    text: "text-red-300",
    label: "DANGER",
  },
  unknown: {
    border: "border-slate-600/40",
    text: "text-slate-400",
    label: "UNKNOWN",
  },
};

function WarningCard({
  severity,
  title,
  message,
}: {
  severity: "info" | "warning" | "danger";
  title: string;
  message: string;
}) {
  const tone =
    severity === "danger"
      ? "border-red-500/40 bg-red-950/25 text-red-200"
      : severity === "warning"
        ? "border-amber-500/40 bg-amber-950/20 text-amber-200"
        : "border-slate-600/40 bg-slate-900/40 text-slate-400";
  return (
    <div className={cn("rounded border px-2 py-1 text-[8px] leading-snug", tone)}>
      <div className="font-bold uppercase tracking-wide">{title}</div>
      <div className="opacity-90">{message}</div>
    </div>
  );
}

type ReadOnlyRiskMirrorPanelProps = {
  symbol: string;
};

export function ReadOnlyRiskMirrorPanel({ symbol }: ReadOnlyRiskMirrorPanelProps) {
  const { enabled, isLoading, isError, error, snapshot, isEmpty } =
    useBingXReadOnlyRiskMirror(symbol);

  if (!enabled) return null;

  return (
    <section className="rounded border border-violet-500/25 bg-violet-950/15 p-2 space-y-2">
      <div className="space-y-0.5">
        <div className="text-[8px] font-bold uppercase tracking-widest text-violet-300/95">
          Real Risk Mirror
        </div>
        <div className="text-[7px] font-mono uppercase tracking-wider text-slate-500">
          BingX · Read only · Trading locked
        </div>
      </div>

      {isLoading && !snapshot ? (
        <p className="text-[8px] text-slate-500">Loading risk mirror…</p>
      ) : null}

      {isError ? (
        <p className="text-[8px] text-red-300/90">
          {error instanceof Error ? error.message : "Risk mirror error"}
        </p>
      ) : null}

      {snapshot ? <MirrorBody snapshot={snapshot} isEmpty={isEmpty} /> : null}
    </section>
  );
}

function MirrorBody({
  snapshot,
  isEmpty,
}: {
  snapshot: ReadOnlyRiskMirrorSnapshot;
  isEmpty: boolean;
}) {
  const pos = snapshot.position;
  const ctx = snapshot.context;
  const scoreStyle = SCORE_STYLES[snapshot.score.status] ?? SCORE_STYLES.unknown;
  const displayWarnings = snapshot.warnings.filter((w) => w.id !== "trading_locked");

  return (
    <>
      <div
        className={cn(
          "rounded border px-2 py-1 flex items-center justify-between gap-2",
          scoreStyle.border,
        )}
      >
        <span className={cn("text-[9px] font-bold uppercase tracking-widest", scoreStyle.text)}>
          {scoreStyle.label}
        </span>
        <span className="text-[7px] text-slate-500 tabular-nums">
          {snapshot.score.confidence}% conf.
        </span>
      </div>
      <p className="text-[8px] text-slate-400 leading-snug">{snapshot.score.summary}</p>

      {isEmpty ? (
        <p className="text-[8px] text-slate-500 italic">No real BingX position open.</p>
      ) : pos ? (
        <div className="rounded border border-terminal-border/60 bg-[#080808] p-1.5 space-y-1">
          <div className="text-[7px] font-bold uppercase tracking-widest text-slate-500">
            Position
          </div>
          <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-[8px] text-slate-400">
            <span>Side</span>
            <span
              className={cn(
                "text-right font-bold uppercase",
                pos.side === "long" ? "text-emerald-400" : "text-orange-400",
              )}
            >
              {pos.side}
            </span>
            <span>Qty</span>
            <span className="text-right text-slate-200">{pos.quantity}</span>
            <span>Entry</span>
            <span className="text-right text-slate-200">{fmtPrice(pos.entryPrice)}</span>
            <span>Mark</span>
            <span className="text-right text-slate-200">{fmtPrice(pos.markPrice)}</span>
            <span>Notional</span>
            <span className="text-right text-slate-200">
              {pos.notionalUsdt != null ? `${pos.notionalUsdt.toFixed(2)} USDT` : "--"}
            </span>
            <span>uPnL</span>
            <span
              className={cn(
                "text-right",
                (pos.unrealizedPnlUsdt ?? 0) > 0 && "text-emerald-400",
                (pos.unrealizedPnlUsdt ?? 0) < 0 && "text-red-400",
              )}
            >
              {pos.unrealizedPnlUsdt != null
                ? `${pos.unrealizedPnlUsdt.toFixed(2)} USDT`
                : "--"}
            </span>
            <span>uPnL % acct</span>
            <span className="text-right text-slate-200">
              {pos.unrealizedPnlAccountPct != null
                ? fmtPct(pos.unrealizedPnlAccountPct)
                : "unavailable"}
            </span>
            <span>Leverage</span>
            <span className="text-right text-slate-200">
              {pos.leverage != null ? `${pos.leverage}x` : "--"}
            </span>
            <span>Margin</span>
            <span className="text-right text-slate-200 uppercase text-[7px]">
              {pos.marginMode ?? "unknown"}
            </span>
            <span>Liq distance</span>
            <span className="text-right text-slate-200">
              {pos.distanceToLiquidationPct != null
                ? fmtPct(pos.distanceToLiquidationPct)
                : "unavailable"}
            </span>
            <span>vs entry</span>
            <span className="text-right text-slate-200">
              {pos.distanceToEntryPct != null ? fmtPct(pos.distanceToEntryPct) : "--"}
            </span>
          </div>
        </div>
      ) : null}

      <div className="rounded border border-terminal-border/60 bg-[#080808] p-1.5 space-y-1">
        <div className="text-[7px] font-bold uppercase tracking-widest text-slate-500">
          Institutional context
        </div>
        <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-[8px] text-slate-400">
          <span>Gamma</span>
          <span className="text-right text-slate-200">{gammaStateLabel(ctx.gammaState)}</span>
          <span>Flip</span>
          <span className="text-right text-slate-200">
            {ctx.gammaFlip != null ? fmtPrice(ctx.gammaFlip) : "Context unavailable"}
          </span>
          <span>Transition</span>
          <span className="text-right text-slate-200 text-[7px]">
            {ctx.transitionZone?.lower != null || ctx.transitionZone?.upper != null
              ? `${fmtPrice(ctx.transitionZone?.lower)} – ${fmtPrice(ctx.transitionZone?.upper)}`
              : "Context unavailable"}
          </span>
          <span>Γ magnet</span>
          <span className="text-right text-slate-200 text-[7px]">
            {ctx.nearestGammaMagnet
              ? `${fmtPrice(ctx.nearestGammaMagnet.price)} (${ctx.nearestGammaMagnet.distancePct.toFixed(1)}%)`
              : "Context unavailable"}
          </span>
          <span>Liq magnet</span>
          <span className="text-right text-slate-200 text-[7px]">
            {ctx.nearestLiquidityMagnet
              ? `${fmtPrice(ctx.nearestLiquidityMagnet.price)} ${ctx.nearestLiquidityMagnet.side ?? ""} (${ctx.nearestLiquidityMagnet.distancePct.toFixed(1)}%)`
              : "Context unavailable"}
          </span>
          <span>Support</span>
          <span className="text-right text-slate-200 text-[7px]">
            {ctx.nearestSupport
              ? `${fmtPrice(ctx.nearestSupport.price)} (${ctx.nearestSupport.distancePct.toFixed(1)}%)`
              : "Context unavailable"}
          </span>
          <span>Resistance</span>
          <span className="text-right text-slate-200 text-[7px]">
            {ctx.nearestResistance
              ? `${fmtPrice(ctx.nearestResistance.price)} (${ctx.nearestResistance.distancePct.toFixed(1)}%)`
              : "Context unavailable"}
          </span>
        </div>
      </div>

      {displayWarnings.length > 0 ? (
        <div className="space-y-1">
          <div className="text-[7px] font-bold uppercase tracking-widest text-slate-500">
            Warnings
          </div>
          {displayWarnings.map((w) => (
            <WarningCard
              key={w.id}
              severity={w.severity}
              title={w.title}
              message={w.message}
            />
          ))}
        </div>
      ) : null}
    </>
  );
}
