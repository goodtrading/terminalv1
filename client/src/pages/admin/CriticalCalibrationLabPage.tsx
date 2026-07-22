/**
 * AI-7.3 Critical Calibration Lab — admin UI. No auto Brain mutate.
 */
import { useCallback, useState } from "react";
import { Link } from "wouter";
import { apiUrl } from "@/lib/apiBase";
import type { SyntheticScenario, CriticalReview, ImprovementProposal, CalibrationQuestion, CalibrationMetrics } from "@shared/goodTradingAiCriticalCalibration";
import type { DecisionPathOutcome } from "@shared/goodTradingAiDecisionGraph";

const OUTCOMES: DecisionPathOutcome[] = [
  "HYPOTHESIS_OPEN", "HYPOTHESIS_SUPPORTED", "HYPOTHESIS_WEAKENED", "HYPOTHESIS_INVALIDATED",
  "READING_CONFLICTED", "EVIDENCE_INSUFFICIENT", "CONTEXT_STALE", "CONTEXT_UNTRUSTED",
  "GUARD_BLOCKED", "NEEDS_MORE_LENSES",
];

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(apiUrl(path), {
    credentials: "include",
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof body?.message === "string" ? body.message : body?.code ?? `HTTP ${res.status}`);
  return body as T;
}

export default function CriticalCalibrationLabPage() {
  const [error, setError] = useState<string | null>(null);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [scenarios, setScenarios] = useState<SyntheticScenario[]>([]);
  const [idx, setIdx] = useState(0);
  const [engineOutcome, setEngineOutcome] = useState<DecisionPathOutcome | "">("");
  const [humanOutcome, setHumanOutcome] = useState<DecisionPathOutcome | "">("");
  const [review, setReview] = useState<CriticalReview | null>(null);
  const [proposals, setProposals] = useState<ImprovementProposal[]>([]);
  const [questions, setQuestions] = useState<CalibrationQuestion[]>([]);
  const [metrics, setMetrics] = useState<CalibrationMetrics | null>(null);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);

  const current = scenarios[idx];

  const loadStatus = useCallback(async () => {
    try {
      const s = await api<{ enabled: boolean; note?: string }>("/api/internal/ai/critical-calibration/status");
      setEnabled(s.enabled);
    } catch (e) {
      setEnabled(false);
      setError(e instanceof Error ? e.message : "Status unavailable");
    }
  }, []);

  const generate = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api<{ scenarios: SyntheticScenario[] }>("/api/internal/ai/critical-calibration/scenarios/generate", {
        method: "POST",
        body: JSON.stringify({ count: 12, seed: String(Date.now()) }),
      });
      setScenarios(res.scenarios);
      setIdx(0);
      setReview(null);
      setEngineOutcome("");
      setHumanOutcome("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generate failed");
    } finally {
      setLoading(false);
    }
  }, []);

  const runReview = useCallback(async () => {
    if (!current) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api<{ review: CriticalReview }>("/api/internal/ai/critical-calibration/review", {
        method: "POST",
        body: JSON.stringify({
          scenario: current,
          humanOutcome: humanOutcome || null,
          engineOutcome: engineOutcome || undefined,
        }),
      });
      setReview(res.review);
      if (!engineOutcome && res.review.engineOutcome) setEngineOutcome(res.review.engineOutcome);
      const propRes = await api<{ proposals: ImprovementProposal[] }>("/api/internal/ai/critical-calibration/proposals/from-review", {
        method: "POST",
        body: JSON.stringify({ scenario: current, engineOutcome: res.review.engineOutcome, humanOutcome: humanOutcome || null }),
      });
      setProposals(propRes.proposals);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Review failed");
    } finally {
      setLoading(false);
    }
  }, [current, engineOutcome, humanOutcome]);

  const decide = useCallback(async (id: string, status: "ACCEPTED" | "REJECTED") => {
    setLoading(true);
    try {
      await api("/api/internal/ai/critical-calibration/proposals/" + id + "/decide", {
        method: "POST",
        body: JSON.stringify({ status, note }),
      });
      const list = await api<{ proposals: ImprovementProposal[] }>("/api/internal/ai/critical-calibration/proposals");
      setProposals(list.proposals);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Decide failed");
    } finally {
      setLoading(false);
    }
  }, [note]);

  const loadQuestions = useCallback(async () => {
    try {
      const res = await api<{ questions: CalibrationQuestion[] }>("/api/internal/ai/critical-calibration/questions/generate", {
        method: "POST",
        body: JSON.stringify({ scenarios }),
      });
      setQuestions(res.questions);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Questions failed");
    }
  }, [scenarios]);

  const loadMetrics = useCallback(async () => {
    try {
      const res = await api<{ metrics: CalibrationMetrics }>("/api/internal/ai/critical-calibration/metrics");
      setMetrics(res.metrics);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Metrics failed");
    }
  }, []);

  return (
    <div className="min-h-screen bg-terminal-bg text-terminal-text px-4 py-6 font-mono text-sm">
      <div className="max-w-5xl mx-auto space-y-4">
        <div className="flex items-center gap-2 text-xs">
          <Link href="/admin" className="text-terminal-accent hover:underline">Admin</Link>
          <span className="text-terminal-muted">/</span>
          <span>Critical Calibration Lab</span>
        </div>
        <p className="text-terminal-muted text-xs border border-amber-500/30 bg-amber-500/10 px-2 py-1 rounded-sm">
          Flag GOODTRADING_AI_CRITICAL_CALIBRATION_ENABLED (default OFF). mentorEligible=false — proposals never mutate Brain.
          {enabled === false && " Lab disabled on server until flag enabled."}
        </p>
        {error && <div className="text-red-400 border border-red-500/40 px-2 py-1">{error}</div>}
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => void loadStatus()} className="border border-terminal-border px-2 py-1">Status</button>
          <button type="button" disabled={loading} onClick={() => void generate()} className="border border-terminal-accent text-terminal-accent px-2 py-1">Generate Scenarios</button>
          <button type="button" onClick={() => void loadQuestions()} className="border border-terminal-border px-2 py-1">Question Queue</button>
          <button type="button" onClick={() => void loadMetrics()} className="border border-terminal-border px-2 py-1">Statistics</button>
        </div>
        {current && (
          <div className="grid md:grid-cols-2 gap-3">
            <div className="border border-terminal-border bg-terminal-panel p-3 space-y-2">
              <div className="text-xs text-terminal-muted uppercase">Generated Scenario</div>
              <pre className="whitespace-pre-wrap text-[11px]">{current.narrative}</pre>
              <div className="flex gap-2">
                <button type="button" disabled={idx <= 0} onClick={() => setIdx((i) => i - 1)}>Prev</button>
                <button type="button" disabled={idx >= scenarios.length - 1} onClick={() => setIdx((i) => i + 1)}>Next</button>
              </div>
            </div>
            <div className="border border-terminal-border bg-terminal-panel p-3 space-y-2">
              <div className="text-xs text-terminal-muted uppercase">Engine / Human</div>
              <label className="block text-[11px]">Engine outcome
                <select className="w-full bg-terminal-bg border border-terminal-border mt-1" value={engineOutcome} onChange={(e) => setEngineOutcome(e.target.value as DecisionPathOutcome | "")}>
                  <option value="">(auto evaluate)</option>
                  {OUTCOMES.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </label>
              <label className="block text-[11px]">Human outcome
                <select className="w-full bg-terminal-bg border border-terminal-border mt-1" value={humanOutcome} onChange={(e) => setHumanOutcome(e.target.value as DecisionPathOutcome | "")}>
                  <option value="">—</option>
                  {OUTCOMES.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </label>
              <button type="button" disabled={loading} onClick={() => void runReview()} className="border border-terminal-accent text-terminal-accent px-2 py-1">Run Critical Review</button>
            </div>
          </div>
        )}
        {review && (
          <div className="border border-terminal-border bg-terminal-panel p-3">
            <div className="text-xs text-terminal-muted uppercase mb-1">Critical Review</div>
            <p>{review.summary}</p>
            <p className="text-terminal-muted text-[11px]">Taxonomy: {review.taxonomy}</p>
            <ul className="list-disc pl-4 text-[11px]">{review.findings.map((f) => <li key={f.id}>{f.message}</li>)}</ul>
          </div>
        )}
        {proposals.length > 0 && (
          <div className="border border-terminal-border bg-terminal-panel p-3 space-y-2">
            <div className="text-xs text-terminal-muted uppercase">Proposals (approve/reject — no Brain mutate)</div>
            <input className="w-full bg-terminal-bg border border-terminal-border px-2 py-1 text-[11px]" placeholder="Decision note" value={note} onChange={(e) => setNote(e.target.value)} />
            {proposals.map((p) => (
              <div key={p.id} className="border border-terminal-border/60 p-2 text-[11px] flex justify-between gap-2">
                <span>{p.title} — {p.status} (brainMutate={String(p.brainMutate)})</span>
                {p.status === "PENDING" && (
                  <span className="flex gap-1">
                    <button type="button" onClick={() => void decide(p.id, "ACCEPTED")}>Accept</button>
                    <button type="button" onClick={() => void decide(p.id, "REJECTED")}>Reject</button>
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
        {questions.length > 0 && (
          <div className="border border-terminal-border bg-terminal-panel p-3">
            <div className="text-xs text-terminal-muted uppercase mb-1">Question Queue</div>
            <ul className="space-y-1 text-[11px]">{questions.map((q) => <li key={q.id}><span className="text-terminal-muted">[{q.infoGainScore.toFixed(2)}]</span> {q.prompt}</li>)}</ul>
          </div>
        )}
        {metrics && (
          <div className="border border-terminal-border bg-terminal-panel p-3 text-[11px]">
            <div className="text-xs text-terminal-muted uppercase mb-1">Statistics</div>
            <pre>{JSON.stringify(metrics, null, 2)}</pre>
          </div>
        )}
      </div>
    </div>
  );
}