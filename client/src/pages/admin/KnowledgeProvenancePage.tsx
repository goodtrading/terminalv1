/**
 * AI-7.3.6 Knowledge Provenance Dashboard — separate from Evolution/Distillation.
 * credentials:include. No Brain apply. Append-only audit view.
 */
import { useCallback, useEffect, useState } from "react";
import { Link } from "wouter";
import {
  fetchImpact,
  fetchKpStatus,
  fetchLatest,
  fetchLineage,
  fetchProposalContext,
  fetchQuery,
  fetchRationale,
  fetchRegistry,
  fetchRelatedRules,
  fetchTimeline,
  runProvenance,
} from "@/lib/knowledgeProvenance/knowledgeProvenanceApi";

type Mode =
  | "overview"
  | "registry"
  | "timeline"
  | "lineage"
  | "rationale"
  | "dependencies"
  | "impact"
  | "related"
  | "proposals";

export default function KnowledgeProvenancePage() {
  const [mode, setMode] = useState<Mode>("overview");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [note, setNote] = useState("");
  const [ruleId, setRuleId] = useState("RULE_ABSORPTION_DELTA_PRIORITY");
  const [payload, setPayload] = useState<unknown>(null);

  const loadStatus = useCallback(async () => {
    try {
      const s = await fetchKpStatus();
      setEnabled(s.enabled);
      setNote(s.note ?? "");
    } catch (e) {
      setEnabled(false);
      setError(e instanceof Error ? e.message : "Status unavailable");
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const wrap = useCallback(async (fn: () => Promise<void>) => {
    setLoading(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setLoading(false);
    }
  }, []);

  const modes: Array<{ id: Mode; label: string; action?: () => void }> = [
    { id: "overview", label: "Overview" },
    {
      id: "registry",
      label: "Registry",
      action: () => void wrap(async () => { setPayload(await fetchRegistry()); setMode("registry"); }),
    },
    {
      id: "timeline",
      label: "Timeline",
      action: () =>
        void wrap(async () => {
          setPayload(await fetchTimeline(ruleId));
          setMode("timeline");
        }),
    },
    {
      id: "lineage",
      label: "Lineage",
      action: () => void wrap(async () => { setPayload(await fetchLineage()); setMode("lineage"); }),
    },
    {
      id: "rationale",
      label: "Rationale",
      action: () =>
        void wrap(async () => {
          setPayload(await fetchRationale(ruleId));
          setMode("rationale");
        }),
    },
    {
      id: "dependencies",
      label: "Dependencies",
      action: () =>
        void wrap(async () => {
          setPayload(await fetchQuery(ruleId));
          setMode("dependencies");
        }),
    },
    {
      id: "impact",
      label: "Impact",
      action: () =>
        void wrap(async () => {
          setPayload(await fetchImpact(ruleId));
          setMode("impact");
        }),
    },
    {
      id: "related",
      label: "Related Rules",
      action: () =>
        void wrap(async () => {
          setPayload(await fetchRelatedRules(ruleId));
          setMode("related");
        }),
    },
    {
      id: "proposals",
      label: "Proposal Context",
      action: () =>
        void wrap(async () => {
          setPayload(await fetchProposalContext());
          setMode("proposals");
        }),
    },
  ];

  return (
    <div className="min-h-screen bg-terminal-bg text-terminal-text px-4 py-6 font-mono text-sm" data-testid="knowledge-provenance-lab">
      <div className="max-w-6xl mx-auto space-y-4">
        <div className="flex flex-wrap items-center gap-3 justify-between">
          <div className="flex items-center gap-3">
            <Link href="/admin" className="text-terminal-accent hover:underline text-xs">
              ← Admin
            </Link>
            <span className="text-terminal-muted">/</span>
            <span>Knowledge Provenance</span>
            <Link href="/admin/knowledge-evolution" className="text-terminal-accent hover:underline text-xs">
              Evolution
            </Link>
            <Link href="/admin/knowledge-distillation" className="text-terminal-accent hover:underline text-xs">
              Distillation
            </Link>
          </div>
          <div className="text-[11px] text-terminal-muted">
            Flag: {enabled == null ? "…" : enabled ? "ON" : "OFF"} · append-only · brainMutate=false
          </div>
        </div>

        <div className="border border-terminal-border rounded-sm p-3 text-[11px] text-terminal-muted space-y-1">
          <div>Flag GOODTRADING_AI_KNOWLEDGE_PROVENANCE_ENABLED (default OFF).</div>
          <div>Full traceability: origin, justification history, rationale, lineage, impact, proposal context.</div>
          <div>Never edits past justifications. Never applies proposals. Never mutates Brain.</div>
          {note ? <div>{note}</div> : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="text-[11px] text-terminal-muted">ruleId</label>
          <input
            value={ruleId}
            onChange={(e) => setRuleId(e.target.value.trim())}
            className="bg-transparent border border-terminal-border px-2 py-1 text-[11px] min-w-[280px]"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          {modes.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => (m.action ? m.action() : setMode(m.id))}
              className={`text-[11px] border px-2 py-1 rounded-sm ${
                mode === m.id ? "border-terminal-accent text-white" : "border-terminal-border text-terminal-muted"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={loading}
            onClick={() =>
              void wrap(async () => {
                const res = await runProvenance();
                setPayload(res.result);
                setMode("overview");
              })
            }
            className="text-[11px] border border-terminal-accent px-3 py-1.5 rounded-sm text-white hover:bg-terminal-accent/10 disabled:opacity-50"
          >
            Run Provenance
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={() =>
              void wrap(async () => {
                setPayload(await fetchLatest());
                setMode("overview");
              })
            }
            className="text-[11px] border border-terminal-border px-3 py-1.5 rounded-sm text-terminal-muted"
          >
            Latest
          </button>
        </div>

        {error ? <div className="text-red-300 text-xs border border-red-900/50 p-2 rounded-sm">{error}</div> : null}
        {loading ? <div className="text-terminal-muted text-xs">Loading…</div> : null}

        <pre className="border border-terminal-border rounded-sm p-3 overflow-auto max-h-[70vh] text-[10px] leading-relaxed text-terminal-muted whitespace-pre-wrap">
          {payload ? JSON.stringify(payload, null, 2) : "Sin run. Ejecutá Run Provenance (flag ON + admin)."}
        </pre>
      </div>
    </div>
  );
}