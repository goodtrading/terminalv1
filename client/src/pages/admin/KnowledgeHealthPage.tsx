/**
 * Knowledge Health + Curation Review Queue (AI-5.5).
 * Visual summary + Accept/Edit/Merge/Ignore. Never auto-writes Brain.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { apiUrl } from "@/lib/apiBase";
import type {
  CurationDecision,
  CurationIssue,
  KnowledgeHealthMetrics,
} from "@shared/goodTradingAiCuration";

type QueueStats = {
  pending: number;
  accepted: number;
  ignored: number;
  edited: number;
  merged: number;
  total: number;
  byKind: Record<string, number>;
};

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(apiUrl(path), {
    credentials: "include",
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });
  const body = (await res.json().catch(() => ({}))) as T & { code?: string; message?: string };
  if (!res.ok) {
    throw Object.assign(new Error(body.message || `HTTP ${res.status}`), { code: body.code });
  }
  return body;
}

function MetricChip({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded border border-zinc-800 bg-zinc-900/60 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-zinc-500">{label}</div>
      <div className="font-mono text-lg text-zinc-100">{value}</div>
    </div>
  );
}

export default function KnowledgeHealthPage() {
  const [note, setNote] = useState<string | null>(null);
  const [health, setHealth] = useState<KnowledgeHealthMetrics | null>(null);
  const [stats, setStats] = useState<QueueStats | null>(null);
  const [issues, setIssues] = useState<CurationIssue[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [editedSummary, setEditedSummary] = useState("");
  const [filterKind, setFilterKind] = useState<string>("");

  const selected = useMemo(
    () => issues.find((i) => i.id === selectedId) ?? null,
    [issues, selectedId],
  );

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const status = await api<{
        enabled: boolean;
        stats: QueueStats;
        health: KnowledgeHealthMetrics | null;
        note?: string;
      }>("/api/internal/ai/curation/status");
      setStats(status.stats);
      setHealth(status.health);
      setNote(status.note ?? null);
      const q = filterKind ? `?kind=${encodeURIComponent(filterKind)}` : "";
      const queue = await api<{
        issues: CurationIssue[];
        stats: QueueStats;
        health: KnowledgeHealthMetrics | null;
      }>(`/api/internal/ai/curation/queue${q}`);
      setIssues(queue.issues);
      setStats(queue.stats);
      if (queue.health) setHealth(queue.health);
      if (!selectedId && queue.issues[0]) setSelectedId(queue.issues[0].id);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error cargando curation");
    }
  }, [filterKind, selectedId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (selected) setEditedSummary(selected.summary);
  }, [selected?.id]);

  const runScan = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await api<{
        metrics: KnowledgeHealthMetrics;
        issues: CurationIssue[];
        stats: QueueStats;
        autoAppliedToBrain: boolean;
      }>("/api/internal/ai/curation/scan", {
        method: "POST",
        body: JSON.stringify({ includeQuality: true }),
      });
      setHealth(res.metrics);
      setIssues(res.issues);
      setStats(res.stats);
      if (res.issues[0]) setSelectedId(res.issues[0].id);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Scan falló");
    } finally {
      setBusy(false);
    }
  };

  const decide = async (decision: CurationDecision) => {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      await api("/api/internal/ai/curation/review", {
        method: "POST",
        body: JSON.stringify({
          issueId: selected.id,
          decision,
          notes: notes || undefined,
          editedSummary: decision === "EDIT" ? editedSummary : undefined,
          mergeKeepId: selected.merge?.keepId,
          mergeDropId: selected.merge?.dropId,
        }),
      });
      setNotes("");
      await refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Review falló");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100" data-testid="knowledge-health">
      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-6 flex flex-wrap items-center gap-2 text-sm text-zinc-400">
          <Link href="/admin" className="text-terminal-accent hover:underline">
            Admin
          </Link>
          <span>/</span>
          <Link href="/admin/ai-lab" className="text-terminal-accent hover:underline">
            AI Lab
          </Link>
          <span>/</span>
          <Link href="/admin/knowledge-inbox" className="text-terminal-accent hover:underline">
            Knowledge Inbox
          </Link>
          <span>/</span>
          <span className="text-zinc-200">Knowledge Health</span>
        </div>

        <h1 className="mb-2 text-2xl font-semibold tracking-tight">Knowledge Health</h1>
        <p className="mb-4 max-w-2xl text-sm text-zinc-400">
          Diagnóstico y cola de curación del Brain. Solo sugerencias — Accept / Edit / Merge / Ignore.
          Nunca aplica cambios al registry automáticamente.
        </p>

        {note && <p className="mb-4 text-xs text-zinc-500">{note}</p>}
        {error && (
          <div className="mb-4 rounded border border-red-900/60 bg-red-950/40 px-3 py-2 text-sm text-red-200">
            {error}
            {/deshabilitado|disabled|CURATION_/i.test(error) && (
              <div className="mt-1 font-mono text-xs text-zinc-400">
                GOODTRADING_AI_CURATION_ENABLED=true
              </div>
            )}
          </div>
        )}

        <div className="mb-6 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void runScan()}
            className="rounded bg-emerald-700 px-3 py-1.5 text-sm hover:bg-emerald-600 disabled:opacity-50"
          >
            {busy ? "Escaneando…" : "Run curation scan"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void refresh()}
            className="rounded border border-zinc-700 px-3 py-1.5 text-sm hover:bg-zinc-900"
          >
            Refresh
          </button>
        </div>

        {health && (
          <section className="mb-8">
            <h2 className="mb-3 text-sm font-medium text-zinc-300">Health summary</h2>
            <div className="mb-3 h-2 overflow-hidden rounded bg-zinc-800">
              <div
                className="h-full bg-emerald-600 transition-all"
                style={{ width: `${Math.min(100, health.overallHealthPct)}%` }}
              />
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 md:grid-cols-5">
              <MetricChip label="Overall" value={`${health.overallHealthPct}%`} />
              <MetricChip label="Entries" value={health.entryCount} />
              <MetricChip label="Duplicates" value={health.duplicates} />
              <MetricChip label="Conflicts" value={health.conflicts} />
              <MetricChip label="No relations" value={health.noRelations} />
              <MetricChip label="Deprecated?" value={health.deprecatedCandidates} />
              <MetricChip label="Orphans" value={health.orphanConcepts} />
              <MetricChip label="Low quality" value={health.lowQuality} />
              <MetricChip label="Never used*" value={health.neverUsed} />
              <MetricChip label="Avg quality" value={health.averageQualityScore} />
            </div>
            <p className="mt-2 text-[11px] text-zinc-600">
              * timesReferenced / reasoning usage stub=0 hasta exista telemetría. Scan {health.durationMs}ms.
            </p>
          </section>
        )}

        {stats && (
          <div className="mb-4 flex flex-wrap gap-3 text-xs text-zinc-400">
            <span>Pending: {stats.pending}</span>
            <span>Accepted: {stats.accepted}</span>
            <span>Merged: {stats.merged}</span>
            <span>Ignored: {stats.ignored}</span>
            <span>Total issues: {stats.total}</span>
          </div>
        )}

        <div className="mb-3">
          <label className="mr-2 text-xs text-zinc-500">Filter kind</label>
          <select
            value={filterKind}
            onChange={(e) => setFilterKind(e.target.value)}
            className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm"
          >
            <option value="">All</option>
            {[
              "DUPLICATE",
              "POSSIBLE_MERGE",
              "NEAR_DUPLICATE",
              "CONFLICT",
              "ORPHAN",
              "MISSING_RELATION",
              "DEPRECATION",
              "LOW_QUALITY",
            ].map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <ul className="max-h-[28rem] space-y-1 overflow-auto rounded border border-zinc-800 p-2">
            {issues.map((i) => (
              <li key={i.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(i.id)}
                  className={`w-full rounded px-2 py-1.5 text-left text-sm ${
                    selectedId === i.id ? "bg-zinc-800 text-white" : "hover:bg-zinc-900 text-zinc-300"
                  }`}
                >
                  <span className="font-mono text-[10px] text-zinc-500">{i.kind}</span>{" "}
                  <span className="text-zinc-200">{i.title}</span>
                  <span className="ml-2 text-[10px] text-zinc-600">{i.status}</span>
                </button>
              </li>
            ))}
            {!issues.length && (
              <li className="px-2 py-6 text-center text-sm text-zinc-600">
                Sin issues. Ejecutá un scan.
              </li>
            )}
          </ul>

          <div className="rounded border border-zinc-800 p-4">
            {!selected ? (
              <p className="text-sm text-zinc-500">Seleccioná un issue.</p>
            ) : (
              <>
                <div className="mb-2 font-mono text-xs text-zinc-500">{selected.id}</div>
                <h3 className="mb-2 text-lg text-zinc-100">{selected.title}</h3>
                <p className="mb-3 text-sm text-zinc-300">{selected.summary}</p>
                <div className="mb-3 text-xs text-zinc-500">
                  Entries: {selected.entryIds.join(", ")}
                  {selected.similarity != null && <> · sim {selected.similarity}</>}
                  <> · {selected.severity}</>
                </div>
                {selected.merge && (
                  <div className="mb-3 rounded bg-zinc-900/80 p-2 text-xs text-zinc-400">
                    Merge keep={selected.merge.keepId} drop={selected.merge.dropId}
                    <ul className="mt-1 list-disc pl-4">
                      {selected.merge.risks.map((r) => (
                        <li key={r}>{r}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {selected.suggestedRelations && selected.suggestedRelations.length > 0 && (
                  <div className="mb-3 text-xs text-zinc-400">
                    Suggested relations:
                    <ul className="mt-1 list-disc pl-4">
                      {selected.suggestedRelations.map((r) => (
                        <li key={r.targetId}>
                          {r.relation} → {r.targetId} ({r.reason})
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <label className="mb-1 block text-xs text-zinc-500">Edit summary</label>
                <textarea
                  value={editedSummary}
                  onChange={(e) => setEditedSummary(e.target.value)}
                  rows={3}
                  className="mb-2 w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm"
                />
                <label className="mb-1 block text-xs text-zinc-500">Notes</label>
                <input
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="mb-3 w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm"
                />
                <div className="flex flex-wrap gap-2">
                  {(["ACCEPT", "EDIT", "MERGE", "IGNORE"] as CurationDecision[]).map((d) => (
                    <button
                      key={d}
                      type="button"
                      disabled={busy || selected.status !== "PENDING"}
                      onClick={() => void decide(d)}
                      className="rounded border border-zinc-600 px-2 py-1 text-xs hover:bg-zinc-800 disabled:opacity-40"
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
