import { cn } from "@/lib/utils";
import { HealthRow, HealthSection, healthToneClass } from "./healthUi";
import type { HealthTone } from "./healthUi";
import type {
  LiveReadinessCheck,
  LiveReadinessStatus,
  LiveTradingReadiness,
} from "./liveTradingReadinessTypes";

function statusLabel(status: LiveReadinessStatus): string {
  switch (status) {
    case "locked":
      return "LOCKED";
    case "not_ready":
      return "NOT READY";
    case "ready_for_dry_run":
      return "READY FOR DRY RUN";
    case "ready_for_live":
      return "READY FOR LIVE";
    default:
      return String(status).toUpperCase();
  }
}

function statusTone(status: LiveReadinessStatus): HealthTone {
  switch (status) {
    case "ready_for_live":
      return "warn";
    case "ready_for_dry_run":
      return "neutral";
    case "not_ready":
      return "warn";
    case "locked":
    default:
      return "ok";
  }
}

function checkSymbol(status: LiveReadinessCheck["status"]): string {
  if (status === "pass") return "✓";
  if (status === "warning") return "!";
  return "✕";
}

function checkTone(status: LiveReadinessCheck["status"]): HealthTone {
  if (status === "pass") return "ok";
  if (status === "warning") return "warn";
  return "error";
}

type LiveTradingReadinessBlockProps = {
  readiness: LiveTradingReadiness | null;
  isLoading?: boolean;
  isPaperMode?: boolean;
  compact?: boolean;
};

export function LiveTradingReadinessBlock({
  readiness,
  isLoading = false,
  isPaperMode = false,
  compact = false,
}: LiveTradingReadinessBlockProps) {
  if (isPaperMode) {
    return (
      <HealthSection title="Live trading readiness">
        <p className="text-[8px] text-slate-500 leading-snug py-0.5">
          Live readiness only applies to BingX. Paper trading uses the simulation
          engine.
        </p>
      </HealthSection>
    );
  }

  const status = readiness?.status ?? "locked";
  const tone = statusTone(status);
  const compactIds = [
    "bingx_connection",
    "credentials_encrypted",
    "balance_loaded",
    "risk_guard_active",
    "live_flags",
    "api_trading_permission",
  ];

  const displayChecks = compact
    ? (readiness?.checks.filter((c) => compactIds.includes(c.id)) ?? [])
    : (readiness?.checks ?? []);

  const seen = new Set<string>();
  const checks = displayChecks.filter((c) => {
    if (seen.has(c.id)) return false;
    seen.add(c.id);
    return true;
  });

  return (
    <HealthSection title="Live trading readiness">
      <div className="flex items-center gap-1.5 py-0.5">
        <span
          className={cn(
            "text-[8px] font-bold uppercase tracking-wider rounded border px-1.5 py-0.5",
            healthToneClass(tone),
            tone === "ok" && "border-emerald-500/35",
            tone === "warn" && "border-amber-500/40",
            tone === "neutral" && "border-slate-500/40",
          )}
        >
          {isLoading ? "CHECKING…" : statusLabel(status)}
        </span>
      </div>

      {status === "ready_for_live" ? (
        <p className="text-[8px] text-amber-200/90 font-semibold leading-snug">
          LIVE TRADING: READY FOR LIVE — LIMIT ONLY · MARKET DISABLED
        </p>
      ) : (
        <p className="text-[8px] text-red-300/80 font-semibold leading-snug">
          Real limit submit disabled — check readiness and flags.
        </p>
      )}

      {checks.length > 0 ? (
        <ul className="space-y-0.5 py-0.5">
          {checks.map((c) => (
            <li
              key={c.id}
              className={cn(
                "text-[8px] leading-snug flex gap-1",
                healthToneClass(checkTone(c.status)),
              )}
              title={c.message}
            >
              <span className="shrink-0 w-3 text-center">{checkSymbol(c.status)}</span>
              <span className="truncate">{c.label}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {!compact && readiness?.blockers && readiness.blockers.length > 0 ? (
        <div className="pt-0.5">
          <p className="text-[7px] uppercase text-slate-500 tracking-wider">Blockers</p>
          <ul className="text-[7px] text-slate-400 space-y-0.5 max-h-20 overflow-y-auto">
            {readiness.blockers.slice(0, 10).map((b) => (
              <li key={b} className="truncate">
                · {b}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {compact && readiness?.blockers && readiness.blockers.length > 0 ? (
        <HealthRow
          label="Blockers"
          value={`${readiness.blockers.length}`}
          tone="warn"
        />
      ) : null}

      {readiness ? (
        <>
          <HealthRow
            label="Live flag"
            value={readiness.liveTradingEnabled ? "ON" : "OFF"}
            tone={readiness.liveTradingEnabled ? "error" : "ok"}
          />
          <HealthRow
            label="Order submit"
            value={readiness.orderSubmitEnabled ? "ON" : "OFF"}
            tone={readiness.orderSubmitEnabled ? "warn" : "ok"}
          />
        </>
      ) : null}

    </HealthSection>
  );
}
