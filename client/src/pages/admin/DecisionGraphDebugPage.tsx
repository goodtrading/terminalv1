/**
 * Admin debug UI for AI-7 Decision Graph + AI-7.1 Golden Decision Review mode.
 * Review is local/manual; never auto-mutates Brain/knowledge.
 */
import { apiUrl } from "../../lib/apiBase";
import { useCallback, useMemo, useState } from "react";
import { Link } from "wouter";

type EvaluateResponse = {
  ok?: boolean;
  durationMs?: number;
  decisionGraph?: {
    templateId?: string;
    quality?: string;
    contextTrust?: string;
    primaryOutcome?: string | null;
    pathSummaries?: Array<{ id: string; outcome: string; stepLabels: string[] }>;
    confirmationLabels?: string[];
    invalidationLabels?: string[];
    conflictCodes?: string[];
    warnings?: string[];
    mentorEligible?: boolean;
  };
  debug?: { nodeCount?: number; pathCount?: number };
  code?: string;
  message?: string;
};

type UiMode = "debug" | "golden_review";

type ReviewStatus = "pending" | "approved" | "rejected" | "needs_template_change";

type LocalReview = {
  caseId: string;
  question: string;
  status: ReviewStatus;
  note: string;
  primaryOutcome?: string | null;
  templateId?: string;
  updatedAtMs: number;
  brainMutate: false;
};

const SAMPLE_GOLDEN_PROMPTS: Array<{ id: string; question: string }> = [
  {
    id: "gd_abs_confirm",
    question: "Explicá absorption con confirmación de pasivo; no uses solo delta",
  },
  {
    id: "gd_delta_alone",
    question: "¿Puedo concluir absorption solo con delta?",
  },
  {
    id: "gd_wall_fake",
    question: "Wall que desaparece — ¿confirmación o invalidación?",
  },
  {
    id: "gd_stale_ctx",
    question: "Contexto de mercado stale — ¿qué calidad de decisión aplica?",
  },
  {
    id: "gd_what_if",
    question: "what if hypothetical: absorption sin acceptance",
  },
];

export default function DecisionGraphDebugPage() {
  const [mode, setMode] = useState<UiMode>("debug");
  const [question, setQuestion] = useState(
    "Explicá absorption con confirmación de pasivo; no uses solo delta",
  );
  const [caseId, setCaseId] = useState("gd_abs_confirm");
  const [reviewNote, setReviewNote] = useState("");
  const [reviews, setReviews] = useState<LocalReview[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [result, setResult] = useState<EvaluateResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadStatus = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(apiUrl("/api/internal/ai/decision-graph/status"), {
        credentials: "include",
      });
      const json = (await res.json()) as {
        enabled?: boolean;
        mentorEligible?: boolean;
        note?: string;
        limits?: {
          maxInternalNodes?: number;
          maxRenderedNodes?: number;
          maxPaths?: number;
          maxDepth?: number;
        };
        code?: string;
        message?: string;
      };
      if (!res.ok) {
        setStatus(`${json.code ?? res.status}: ${json.message ?? "disabled/forbidden"}`);
        return;
      }
      const lim = json.limits
        ? ` · limits=${json.limits.maxInternalNodes}/${json.limits.maxRenderedNodes}/${json.limits.maxPaths}/${json.limits.maxDepth}`
        : "";
      setStatus(
        `enabled=${json.enabled} · mentorEligible=${json.mentorEligible}${lim} · ${json.note ?? ""}`,
      );
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "status failed");
    }
  }, []);

  const evaluate = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(apiUrl("/api/internal/ai/decision-graph/evaluate"), {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question }),
      });
      const json = (await res.json()) as EvaluateResponse;
      if (!res.ok) {
        setError(`${json.code ?? res.status}: ${json.message ?? "evaluate failed"}`);
        setResult(null);
        return;
      }
      setResult(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "evaluate failed");
    } finally {
      setBusy(false);
    }
  }, [question]);

  const recordReview = useCallback(
    (reviewStatus: ReviewStatus) => {
      const g = result?.decisionGraph;
      const rec: LocalReview = {
        caseId: caseId.trim() || "unnamed",
        question,
        status: reviewStatus,
        note: reviewNote.slice(0, 400),
        primaryOutcome: g?.primaryOutcome ?? null,
        templateId: g?.templateId,
        updatedAtMs: Date.now(),
        brainMutate: false,
      };
      setReviews((prev) => {
        const rest = prev.filter((r) => r.caseId !== rec.caseId);
        return [rec, ...rest];
      });
    },
    [caseId, question, reviewNote, result],
  );

  const loadSample = useCallback((id: string, q: string) => {
    setCaseId(id);
    setQuestion(q);
    setResult(null);
    setError(null);
  }, []);

  const g = result?.decisionGraph;
  const reviewBanner = useMemo(
    () =>
      mode === "golden_review"
        ? "Golden Decision Review — manual only. brainMutate=false. No auto knowledge/Brain mutation."
        : null,
    [mode],
  );

  return (
    <div className="min-h-screen bg-terminal-bg text-white p-4 font-mono text-sm" data-testid="decision-graph-debug">
      <div className="max-w-4xl mx-auto space-y-4">
        <div className="flex flex-wrap gap-2 text-[11px] text-terminal-muted">
          <Link href="/admin" className="text-terminal-accent hover:underline">
            Admin
          </Link>
          <span>/</span>
          <span className="text-white">Decision Graph</span>
        </div>
        <h1 className="text-lg tracking-wide">
          {mode === "golden_review" ? "AI-7.1 Golden Decision Review" : "AI-7 Decision Graph Debug"}
        </h1>
        <p className="text-terminal-muted text-xs">
          Deterministic educational graph. No BUY/SELL. Not Mentor-live. Flag{" "}
          <code>GOODTRADING_AI_DECISION_GRAPH_ENABLED</code> (default false).
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={`border px-2 py-1 rounded-sm ${
              mode === "debug"
                ? "border-terminal-accent text-terminal-accent"
                : "border-terminal-border hover:text-terminal-accent"
            }`}
            onClick={() => setMode("debug")}
          >
            Debug
          </button>
          <button
            type="button"
            className={`border px-2 py-1 rounded-sm ${
              mode === "golden_review"
                ? "border-terminal-accent text-terminal-accent"
                : "border-terminal-border hover:text-terminal-accent"
            }`}
            onClick={() => setMode("golden_review")}
            data-testid="golden-review-mode"
          >
            Golden Review
          </button>
          <button
            type="button"
            className="border border-terminal-border px-2 py-1 rounded-sm hover:text-terminal-accent"
            onClick={() => void loadStatus()}
          >
            Status
          </button>
          <button
            type="button"
            className="border border-terminal-border px-2 py-1 rounded-sm hover:text-terminal-accent"
            disabled={busy}
            onClick={() => void evaluate()}
          >
            Evaluate
          </button>
        </div>
        {reviewBanner && (
          <div className="text-xs border border-amber-700/60 bg-amber-950/30 px-2 py-1 text-amber-100">
            {reviewBanner}
          </div>
        )}
        {status && <pre className="text-xs whitespace-pre-wrap text-terminal-muted">{status}</pre>}

        {mode === "golden_review" && (
          <div className="space-y-2 border border-terminal-border p-3 text-xs">
            <div className="text-terminal-muted">Sample golden prompts (local review ids)</div>
            <div className="flex flex-wrap gap-2">
              {SAMPLE_GOLDEN_PROMPTS.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className="border border-terminal-border px-2 py-0.5 hover:text-terminal-accent"
                  onClick={() => loadSample(s.id, s.question)}
                >
                  {s.id}
                </button>
              ))}
            </div>
            <label className="block">
              <span className="text-terminal-muted">caseId</span>
              <input
                className="w-full mt-1 bg-black/40 border border-terminal-border p-2 text-xs"
                value={caseId}
                onChange={(e) => setCaseId(e.target.value)}
              />
            </label>
            <label className="block">
              <span className="text-terminal-muted">reviewer note</span>
              <input
                className="w-full mt-1 bg-black/40 border border-terminal-border p-2 text-xs"
                value={reviewNote}
                onChange={(e) => setReviewNote(e.target.value)}
                maxLength={400}
              />
            </label>
            <div className="flex flex-wrap gap-2">
              {(["approved", "rejected", "needs_template_change", "pending"] as ReviewStatus[]).map(
                (s) => (
                  <button
                    key={s}
                    type="button"
                    className="border border-terminal-border px-2 py-1 hover:text-terminal-accent"
                    onClick={() => recordReview(s)}
                  >
                    Mark {s}
                  </button>
                ),
              )}
            </div>
            {reviews.length > 0 && (
              <ul className="list-disc pl-4 space-y-1 text-terminal-muted">
                {reviews.slice(0, 12).map((r) => (
                  <li key={`${r.caseId}-${r.updatedAtMs}`}>
                    {r.caseId}: {r.status} · outcome={r.primaryOutcome ?? "—"} · brainMutate=
                    {String(r.brainMutate)}
                    {r.note ? ` · ${r.note}` : ""}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <textarea
          className="w-full min-h-[100px] bg-black/40 border border-terminal-border p-2 text-xs"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
        />
        {error && <div className="text-red-400 text-xs">{error}</div>}
        {g && (
          <div className="space-y-2 border border-terminal-border p-3 text-xs">
            <div>
              template={g.templateId} · quality={g.quality} · trust={g.contextTrust} · outcome=
              {g.primaryOutcome ?? "null"} · mentorEligible={String(g.mentorEligible)}
            </div>
            <div>
              durationMs={result?.durationMs} · nodes={result?.debug?.nodeCount} · paths=
              {result?.debug?.pathCount}
            </div>
            <div>
              confirmations: {(g.confirmationLabels ?? []).join(" · ") || "—"}
            </div>
            <div>
              invalidations: {(g.invalidationLabels ?? []).join(" · ") || "—"}
            </div>
            <div>conflicts: {(g.conflictCodes ?? []).join(", ") || "—"}</div>
            <div>warnings: {(g.warnings ?? []).join(", ") || "—"}</div>
            <ul className="list-disc pl-4">
              {(g.pathSummaries ?? []).map((p) => (
                <li key={p.id}>
                  {p.id}: {p.outcome} — {p.stepLabels?.join(" → ")}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
