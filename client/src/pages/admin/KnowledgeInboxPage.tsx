/**
 * Knowledge Inbox — admin/internal acquisition review (AI-5).
 * Accept / Edit / Merge / Reject. Never auto-writes Brain.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { apiUrl } from "@/lib/apiBase";
import type {
  KnowledgeAcquisitionProposal,
  ProposalReviewDecision,
} from "@shared/goodTradingAiExtractor";

type InboxStats = {
  pending: number;
  accepted: number;
  rejected: number;
  edited: number;
  merged: number;
  total: number;
  goldenCandidates: number;
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

export default function KnowledgeInboxPage() {
  const [enabledNote, setEnabledNote] = useState<string | null>(null);
  const [stats, setStats] = useState<InboxStats | null>(null);
  const [proposals, setProposals] = useState<KnowledgeAcquisitionProposal[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [transcript, setTranscript] = useState("");
  const [sourceLabel, setSourceLabel] = useState("clase-demo");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editStatement, setEditStatement] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [mergeTargetId, setMergeTargetId] = useState("");
  const [notes, setNotes] = useState("");

  const selected = useMemo(
    () => proposals.find((p) => p.id === selectedId) ?? null,
    [proposals, selectedId],
  );

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const status = await api<{ enabled: boolean; stats: InboxStats; note?: string }>(
        "/api/internal/ai/extractor/status",
      );
      setStats(status.stats);
      setEnabledNote(status.note ?? null);
      const inbox = await api<{ proposals: KnowledgeAcquisitionProposal[]; stats: InboxStats }>(
        "/api/internal/ai/extractor/inbox",
      );
      setProposals(inbox.proposals);
      setStats(inbox.stats);
      if (!selectedId && inbox.proposals[0]) setSelectedId(inbox.proposals[0].id);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Error cargando inbox";
      setError(msg);
    }
  }, [selectedId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (selected) {
      setEditTitle(selected.title);
      setEditStatement(selected.statement);
      setMergeTargetId(selected.dedup.matchedEntryId ?? "");
    }
  }, [selected?.id]);

  const runExtract = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ proposals: KnowledgeAcquisitionProposal[] }>(
        "/api/internal/ai/extractor/extract",
        {
          method: "POST",
          body: JSON.stringify({
            transcript,
            sourceLabel: sourceLabel || undefined,
          }),
        },
      );
      await refresh();
      if (res.proposals[0]) setSelectedId(res.proposals[0].id);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Extract failed");
    } finally {
      setBusy(false);
    }
  };

  const review = async (decision: ProposalReviewDecision) => {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      await api("/api/internal/ai/extractor/review", {
        method: "POST",
        body: JSON.stringify({
          proposalId: selected.id,
          decision,
          editedTitle: decision === "EDIT" ? editTitle : undefined,
          editedStatement: decision === "EDIT" ? editStatement : undefined,
          mergeTargetId: decision === "MERGE" ? mergeTargetId : undefined,
          notes: notes || undefined,
        }),
      });
      setNotes("");
      await refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Review failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100" data-testid="knowledge-inbox">
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
          <div className="flex items-center gap-3">
            <Link href="/admin" className="text-emerald-400/90 hover:underline">
              ← Admin
            </Link>
            <span className="text-zinc-500">/</span>
            <Link href="/admin/ai-lab" className="text-emerald-400/90 hover:underline">
              AI Lab
            </Link>
            <span className="text-zinc-500">/</span>
            <span className="text-white tracking-wide">Knowledge Inbox</span>
          </div>
          <button
            type="button"
            onClick={() => void refresh()}
            className="border border-zinc-700 px-2 py-1 rounded-sm text-zinc-400 hover:text-white"
          >
            Refrescar
          </button>
        </div>

        <p className="text-[11px] text-zinc-400 max-w-3xl leading-relaxed">
          Adquisición de conocimiento desde transcripts de clase. Las propuestas requieren revisión humana
          (Accept / Edit / Merge / Reject). <strong className="text-zinc-200">Nunca</strong> se escriben al
          Brain automáticamente. Flag:{" "}
          <span className="font-mono text-zinc-300">GOODTRADING_AI_EXTRACTOR_ENABLED=true</span>
        </p>
        {enabledNote ? <p className="text-[10px] text-zinc-500 font-mono">{enabledNote}</p> : null}

        {stats ? (
          <div className="flex flex-wrap gap-2 text-[10px] font-mono">
            {[
              ["Pending", stats.pending],
              ["Accepted", stats.accepted],
              ["Edited", stats.edited],
              ["Merged", stats.merged],
              ["Rejected", stats.rejected],
              ["Golden cand.", stats.goldenCandidates],
              ["Total", stats.total],
            ].map(([k, v]) => (
              <div key={String(k)} className="border border-zinc-800 bg-zinc-900/60 px-2 py-1 rounded-sm">
                <span className="text-zinc-500">{k}: </span>
                <span className="text-zinc-100">{v}</span>
              </div>
            ))}
          </div>
        ) : null}

        {error ? (
          <div className="text-[11px] text-red-300 font-mono border border-red-900/50 bg-red-950/30 px-3 py-2" role="alert">
            {error}
          </div>
        ) : null}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <section className="border border-zinc-800 rounded-sm p-3 space-y-2">
            <h2 className="text-sm font-semibold">Extraer transcript</h2>
            <label className="block text-[10px] text-zinc-500 font-mono">
              Source label
              <input
                value={sourceLabel}
                onChange={(e) => setSourceLabel(e.target.value)}
                className="mt-1 w-full bg-black/40 border border-zinc-700 rounded-sm px-2 py-1 text-[11px] text-zinc-200"
              />
            </label>
            <textarea
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              rows={10}
              placeholder="Pegá el transcript de la clase…"
              className="w-full bg-black/40 border border-zinc-700 rounded-sm px-2 py-1 text-[11px] text-zinc-200"
              data-testid="extractor-transcript"
            />
            <button
              type="button"
              disabled={busy || transcript.trim().length < 20}
              onClick={() => void runExtract()}
              className="px-3 py-1.5 text-[11px] font-bold border border-emerald-700/50 bg-emerald-900/30 text-emerald-100 disabled:opacity-40"
              data-testid="extractor-run"
            >
              {busy ? "Procesando…" : "Extraer propuestas"}
            </button>
          </section>

          <section className="border border-zinc-800 rounded-sm p-3 space-y-2">
            <h2 className="text-sm font-semibold">Inbox ({proposals.length})</h2>
            <div className="max-h-80 overflow-y-auto space-y-1" data-testid="extractor-inbox-list">
              {proposals.length === 0 ? (
                <p className="text-[10px] text-zinc-500">Sin propuestas aún.</p>
              ) : (
                proposals.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setSelectedId(p.id)}
                    className={`w-full text-left px-2 py-1.5 border rounded-sm text-[11px] ${
                      selectedId === p.id
                        ? "border-emerald-600/50 bg-emerald-950/40"
                        : "border-zinc-800 bg-zinc-900/40 hover:border-zinc-600"
                    }`}
                  >
                    <div className="flex justify-between gap-2 font-mono text-[9px] text-zinc-500">
                      <span>{p.kind}</span>
                      <span>{p.status}</span>
                    </div>
                    <div className="text-zinc-100 truncate">{p.title}</div>
                    <div className="text-[9px] text-zinc-500">
                      dedup={p.dedup.verdict} · conf={p.scores.confidence.toFixed(2)}
                      {p.goldenCaseCandidate?.isCandidate ? " · golden?" : ""}
                    </div>
                  </button>
                ))
              )}
            </div>
          </section>
        </div>

        {selected ? (
          <section
            className="border border-zinc-800 rounded-sm p-3 space-y-3"
            data-testid="extractor-proposal-detail"
          >
            <div className="flex flex-wrap justify-between gap-2">
              <h2 className="text-sm font-semibold">{selected.title}</h2>
              <span className="text-[10px] font-mono text-zinc-500">
                {selected.kind} · {selected.status} · {selected.id}
              </span>
            </div>
            <p className="text-[11px] text-zinc-300 leading-relaxed">{selected.statement}</p>
            <p className="text-[10px] text-zinc-500">{selected.explanation}</p>
            <div className="text-[10px] font-mono text-zinc-500 space-y-1">
              <div>
                Dedup: {selected.dedup.verdict}
                {selected.dedup.matchedTitle ? ` → ${selected.dedup.matchedTitle}` : ""} (
                {selected.dedup.similarity.toFixed(2)}) — {selected.dedup.reason}
              </div>
              <div>
                Scores: conf {selected.scores.confidence} · novelty {selected.scores.novelty} ·
                importance {selected.scores.importance} · risk {selected.scores.risk}
              </div>
              {selected.suggestedRelations.length > 0 ? (
                <div>
                  Relaciones sugeridas:{" "}
                  {selected.suggestedRelations
                    .map((r) => `${r.relation}→${r.targetId}`)
                    .join(", ")}
                </div>
              ) : null}
              {selected.goldenCaseCandidate?.isCandidate ? (
                <div className="text-amber-200/80">
                  Golden candidate: {selected.goldenCaseCandidate.reason}
                </div>
              ) : null}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <label className="text-[10px] text-zinc-500 block">
                Edit title
                <input
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="mt-1 w-full bg-black/40 border border-zinc-700 rounded-sm px-2 py-1 text-[11px]"
                />
              </label>
              <label className="text-[10px] text-zinc-500 block">
                Merge target id
                <input
                  value={mergeTargetId}
                  onChange={(e) => setMergeTargetId(e.target.value)}
                  className="mt-1 w-full bg-black/40 border border-zinc-700 rounded-sm px-2 py-1 text-[11px] font-mono"
                />
              </label>
            </div>
            <label className="text-[10px] text-zinc-500 block">
              Edit statement
              <textarea
                value={editStatement}
                onChange={(e) => setEditStatement(e.target.value)}
                rows={3}
                className="mt-1 w-full bg-black/40 border border-zinc-700 rounded-sm px-2 py-1 text-[11px]"
              />
            </label>
            <label className="text-[10px] text-zinc-500 block">
              Notes
              <input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="mt-1 w-full bg-black/40 border border-zinc-700 rounded-sm px-2 py-1 text-[11px]"
              />
            </label>

            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["ACCEPT", "Accept"],
                  ["EDIT", "Edit"],
                  ["MERGE", "Merge"],
                  ["REJECT", "Reject"],
                ] as const
              ).map(([d, label]) => (
                <button
                  key={d}
                  type="button"
                  disabled={busy || selected.status !== "PENDING"}
                  onClick={() => void review(d)}
                  className="px-3 py-1.5 text-[11px] border border-zinc-600 bg-zinc-900/80 hover:border-zinc-400 disabled:opacity-40"
                  data-testid={`extractor-review-${d.toLowerCase()}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="text-[9px] text-zinc-600 font-mono">
              autoAppliedToBrain=false — Accept solo marca la propuesta; no muta el registry.
            </p>
          </section>
        ) : null}
      </div>
    </div>
  );
}
