import type { PlaybookEntryExitDelta, PlaybookMatchResult } from "./executionReportTypes";

function deltaStatusClass(status: PlaybookEntryExitDelta["status"]): string {
  if (status === "held" || status === "improved") return "text-emerald-400/90";
  if (status === "weakened") return "text-amber-400/90";
  if (status === "invalidated") return "text-red-400/90";
  if (status === "changed") return "text-cyan-400/80";
  return "text-slate-500";
}

function exitQualityLabel(q: PlaybookEntryExitDelta["exitQuality"]): string {
  return q.replace(/_/g, " ");
}

export function ExecutionPlaybookDeltaPanel({
  delta,
}: {
  delta: PlaybookEntryExitDelta | null | undefined;
}) {
  if (!delta) {
    return (
      <p className="text-[10px] font-mono text-slate-600 py-1">
        Exit delta unavailable.
      </p>
    );
  }

  const confLine =
    delta.entryConfidence != null && delta.exitConfidence != null
      ? `${delta.entryConfidence}% → ${delta.exitConfidence}%${
          delta.confidenceDelta != null
            ? ` (${delta.confidenceDelta >= 0 ? "+" : ""}${delta.confidenceDelta})`
            : ""
        }`
      : delta.entryConfidence != null
        ? `Entry ${delta.entryConfidence}%`
        : null;

  return (
    <div className="py-2 px-2 rounded border border-violet-900/25 bg-[#080808] space-y-2">
      <span className="text-[9px] font-bold uppercase tracking-wider text-violet-500/80">
        Playbook delta
      </span>
      <div className="flex flex-wrap gap-2 text-[10px] font-mono">
        <span className="text-slate-500">
          Status:{" "}
          <span className={deltaStatusClass(delta.status)}>
            {delta.status.toUpperCase()}
          </span>
        </span>
        <span className="text-slate-500">
          Exit:{" "}
          <span className="text-slate-300">{exitQualityLabel(delta.exitQuality)}</span>
        </span>
      </div>
      {confLine ? (
        <p className="text-[10px] font-mono text-slate-400">Confidence: {confLine}</p>
      ) : null}
      {delta.contextAlignmentDelta?.changed ? (
        <p className="text-[10px] text-slate-500">
          Alignment: {delta.contextAlignmentDelta.entry ?? "—"} →{" "}
          {delta.contextAlignmentDelta.exit ?? "—"}
        </p>
      ) : null}
      {delta.riskDelta?.worsened || delta.riskDelta?.improved ? (
        <p className="text-[10px] text-slate-500">
          Risk: {delta.riskDelta.entryRisk ?? "—"} → {delta.riskDelta.exitRisk ?? "—"}
        </p>
      ) : null}
      {(delta.reasons ?? []).length > 0 ? (
        <ul className="text-[10px] text-slate-400 list-disc pl-4 space-y-0.5">
          {(delta.reasons ?? []).map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      ) : null}
      {(delta.warnings ?? []).map((w) => (
        <p key={w} className="text-[10px] text-amber-500/70">
          {w}
        </p>
      ))}
      <p className="text-[10px] text-slate-400 italic leading-snug">{delta.summary}</p>
    </div>
  );
}

export function ExecutionPlaybookPanel({
  playbook,
  delta,
}: {
  playbook: PlaybookMatchResult | null | undefined;
  delta?: PlaybookEntryExitDelta | null;
}) {
  if (!playbook) {
    return (
      <p className="text-[10px] font-mono text-slate-600 py-1">
        Playbook not captured for this trade.
      </p>
    );
  }

  const p = playbook.primary;
  if (!p) {
    return (
      <p className="text-[10px] font-mono text-slate-600 py-1">
        Playbook data incomplete for this trade.
      </p>
    );
  }
  if (p.id === "no_match" && p.status === "no_match") {
    return (
      <div className="space-y-2">
        <div className="py-2 px-2 rounded border border-white/[0.06] bg-[#0a0a0a] space-y-1">
          <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500">
            Playbook
          </span>
          <p className="text-[11px] font-mono text-slate-400">No Playbook Match</p>
          {(p.warnings ?? []).map((w) => (
            <p key={w} className="text-[10px] text-slate-600">
              {w}
            </p>
          ))}
        </div>
        <ExecutionPlaybookDeltaPanel delta={delta} />
      </div>
    );
  }

  const tone =
    p.tags.includes("structural") ? "structural" : p.tags.includes("impulsive") ? "impulsive" : "mixed";

  return (
    <div className="space-y-2">
      <div className="py-2 px-2 rounded border border-cyan-900/30 bg-[#0a0a0a] space-y-2">
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="text-[9px] font-bold uppercase tracking-wider text-cyan-600/80">
            Playbook
          </span>
          <span className="text-[11px] font-mono text-slate-200">
            {p.name} · {p.confidence}%
          </span>
          <span className="text-[9px] uppercase text-slate-500">{p.status}</span>
          <span className="text-[9px] text-slate-600">· {tone}</span>
        </div>

        {(p.reasons ?? []).length > 0 ? (
          <div>
            <p className="text-[9px] uppercase text-slate-600 mb-0.5">Reasons</p>
            <ul className="text-[10px] text-slate-400 space-y-0.5 list-disc pl-4">
              {(p.reasons ?? []).map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {(p.warnings ?? []).length > 0 ? (
          <div>
            <p className="text-[9px] uppercase text-amber-600/70 mb-0.5">Warnings</p>
            <ul className="text-[10px] text-amber-400/70 space-y-0.5 list-disc pl-4">
              {(p.warnings ?? []).map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {(p.invalidations ?? []).length > 0 ? (
          <div>
            <p className="text-[9px] uppercase text-red-500/60 mb-0.5">Invalidations</p>
            <ul className="text-[10px] text-red-400/60 space-y-0.5 list-disc pl-4">
              {(p.invalidations ?? []).map((i) => (
                <li key={i}>{i}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <p className="text-[10px] text-slate-500 italic">{playbook.summary ?? "—"}</p>
      </div>
      <ExecutionPlaybookDeltaPanel delta={delta} />
    </div>
  );
}
