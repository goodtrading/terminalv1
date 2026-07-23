/**
 * AI-7.3.5 Knowledge Evolution Dashboard — separate from Distillation.
 * credentials:include. No Brain apply. Flag-gated.
 */
import { useCallback, useEffect, useState } from "react";
import { Link } from "wouter";
import {
  fetchAdaptivePriority,
  fetchDependencies,
  fetchHealth,
  fetchKeStatus,
  fetchKeystone,
  fetchLatest,
  fetchObsolete,
  fetchProposals,
  fetchRules,
  fetchStability,
  fetchTimeline,
  fetchVolatility,
  postFeedback,
  runEvolution,
} from "@/lib/knowledgeEvolution/knowledgeEvolutionApi";

type Mode =
  | "overview"
  | "rules"
  | "dependencies"
  | "timeline"
  | "volatility"
  | "stability"
  | "health"
  | "obsolete"
  | "keystone"
  | "priority"
  | "proposals";

export default function KnowledgeEvolutionPage() {
  const [mode, setMode] = useState<Mode>("overview");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [note, setNote] = useState("");
  const [payload, setPayload] = useState<unknown>(null);

  const loadStatus = useCallback(async () => {
    try {
      const s = await fetchKeStatus();
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
      id: "rules",
      label: "Rules",
      action: () => void wrap(async () => { setPayload(await fetchRules()); setMode("rules"); }),
    },
    {
      id: "dependencies",
      label: "Dependencies",
      action: () => void wrap(async () => { setPayload(await fetchDependencies()); setMode("dependencies"); }),
    },
    {
      id: "timeline",
      label: "Timeline",
      action: () => void wrap(async () => { setPayload(await fetchTimeline()); setMode("timeline"); }),
    },
    {
      id: "volatility",
      label: "Volatility",
      action: () => void wrap(async () => { setPayload(await fetchVolatility()); setMode("volatility"); }),
    },
    {
      id: "stability",
      label: "Stability",
      action: () => void wrap(async () => { setPayload(await fetchStability()); setMode("stability"); }),
    },
    {
      id: "health",
      label: "Health",
      action: () => void wrap(async () => { setPayload(await fetchHealth()); setMode("health"); }),
    },
    {
      id: "obsolete",
      label: "Obsolete",
      action: () => void wrap(async () => { setPayload(await fetchObsolete()); setMode("obsolete"); }),
    },
    {
      id: "keystone",
      label: "Keystone",
      action: () => void wrap(async () => { setPayload(await fetchKeystone()); setMode("keystone"); }),
    },
    {
      id: "priority",
      label: "Adaptive Priority",
      action: () => void wrap(async () => { setPayload(await fetchAdaptivePriority()); setMode("priority"); }),
    },
    {
      id: "proposals",
      label: "Ranked Proposals",
      action: () => void wrap(async () => { setPayload(await fetchProposals()); setMode("proposals"); }),
    },
  ];

  return (
    <div className="min-h-screen bg-terminal-bg text-terminal-text px-4 py-6 font-mono text-sm" data-testid="knowledge-evolution-lab">
      <div className="max-w-6xl mx-auto space-y-4">
        <div className="flex flex-wrap items-center gap-3 justify-between">
          <div className="flex items-center gap-3">
            <Link href="/admin" className="text-terminal-accent hover:underline text-xs">
              ← Admin
            </Link>
            <span className="text-terminal-muted">/</span>
            <span>Knowledge Evolution</span>
            <Link href="/admin/knowledge-distillation" className="text-terminal-accent hover:underline text-xs">
              Distillation
            </Link>
          </div>
          <div className="text-[11px] text-terminal-muted">
            Flag: {enabled == null ? "…" : enabled ? "ON" : "OFF"} · brainMutate=false · autoApply=false
          </div>
        </div>

        <div className="border border-terminal-border rounded-sm p-3 text-[11px] text-terminal-muted space-y-1">
          <div>Flag GOODTRADING_AI_KNOWLEDGE_EVOLUTION_ENABLED (default OFF).</div>
          <div>Living measurement: registry, history, stability, volatility, dependencies, keystone, obsolete, timeline, health.</div>
          <div>Proposals always PENDING. Never deletes obsolete rules. Never mutates Brain.</div>
          {note ? <div>{note}</div> : null}
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
                const res = await runEvolution();
                setPayload(res.result);
                setMode("overview");
              })
            }
            className="text-[11px] border border-terminal-accent px-3 py-1.5 rounded-sm text-white hover:bg-terminal-accent/10 disabled:opacity-50"
          >
            Run Evolution
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
          <button
            type="button"
            disabled={loading}
            onClick={() =>
              void wrap(async () => {
                setPayload(await postFeedback());
                setMode("health");
              })
            }
            className="text-[11px] border border-terminal-border px-3 py-1.5 rounded-sm text-terminal-muted"
          >
            Session Feedback Loop
          </button>
        </div>

        {error ? <div className="text-red-300 text-xs border border-red-900/50 p-2 rounded-sm">{error}</div> : null}
        {loading ? <div className="text-terminal-muted text-xs">Loading…</div> : null}

        <pre className="border border-terminal-border rounded-sm p-3 overflow-auto max-h-[70vh] text-[10px] leading-relaxed text-terminal-muted whitespace-pre-wrap">
          {payload ? JSON.stringify(payload, null, 2) : "Sin run. Ejecutá Run Evolution (flag ON + admin)."}
        </pre>
      </div>
    </div>
  );
}