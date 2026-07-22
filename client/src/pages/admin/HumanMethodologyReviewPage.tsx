/**
 * AI-7.2 Human Methodology Review — blind UI.
 * HARD ORDER: scenario → structured answer → submit → ONLY THEN reveal.
 */
import { useCallback, useState } from "react";
import { Link } from "wouter";
import { apiUrl } from "@/lib/apiBase";
import type { HumanBlindCaseView } from "@shared/goodTradingAiHumanReview";
import type { DecisionPathOutcome, DecisionQualityCategory } from "@shared/goodTradingAiDecisionGraph";

const OUTCOMES: DecisionPathOutcome[] = [
  "HYPOTHESIS_OPEN",
  "HYPOTHESIS_SUPPORTED",
  "HYPOTHESIS_WEAKENED",
  "HYPOTHESIS_INVALIDATED",
  "READING_CONFLICTED",
  "EVIDENCE_INSUFFICIENT",
  "CONTEXT_STALE",
  "CONTEXT_UNTRUSTED",
  "GUARD_BLOCKED",
  "NEEDS_MORE_LENSES",
];

const QUALITIES: DecisionQualityCategory[] = [
  "WELL_SUPPORTED",
  "PARTIALLY_SUPPORTED",
  "CONFLICTED",
  "INVALIDATED",
  "INSUFFICIENT_EVIDENCE",
  "STALE_CONTEXT",
  "UNTRUSTED_SCENARIO",
];

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(apiUrl(path), {
    credentials: "include",
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(typeof body?.message === "string" ? body.message : body?.code ?? `HTTP ${res.status}`);
  }
  return body as T;
}

type RevealPayload = {
  comparison: {
    comparisonClass: string;
    humanOutcome: string | null;
    engineOutcome: string | null;
    goldenOutcomes: string[];
  };
  engineOutcome: string | null;
  goldenExpectOutcomes: string[];
  proposal: { id: string; status: string; suggestedAction: string } | null;
};

export default function HumanMethodologyReviewPage() {
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [cases, setCases] = useState<HumanBlindCaseView[]>([]);
  const [idx, setIdx] = useState(0);
  const [submitted, setSubmitted] = useState<Record<string, boolean>>({});
  const [reveal, setReveal] = useState<RevealPayload | null>(null);
  const [saving, setSaving] = useState(false);

  const [primaryOutcome, setPrimaryOutcome] = useState<DecisionPathOutcome>("HYPOTHESIS_OPEN");
  const [quality, setQuality] = useState<DecisionQualityCategory | "">("");
  const [confidence, setConfidence] = useState<"LOW" | "MEDIUM" | "HIGH">("MEDIUM");
  const [insufficientEvidence, setInsufficientEvidence] = useState(false);
  const [ambiguousReading, setAmbiguousReading] = useState(false);
  const [notes, setNotes] = useState("");
  const [confirmations, setConfirmations] = useState("");
  const [invalidations, setInvalidations] = useState("");

  const current = cases[idx];

  const startSession = useCallback(async () => {
    setError(null);
    setReveal(null);
    try {
      const res = await api<{
        sessionId: string;
        cases: HumanBlindCaseView[];
        mentorEligible: false;
      }>("/api/internal/ai/decision-human-review/sessions", {
        method: "POST",
        body: JSON.stringify({}),
      });
      setSessionId(res.sessionId);
      setCases(res.cases);
      setIdx(0);
      setSubmitted({});
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo iniciar sesion");
    }
  }, []);

  const submit = useCallback(async () => {
    if (!sessionId || !current) return;
    setSaving(true);
    setError(null);
    setReveal(null);
    try {
      await api(`/api/internal/ai/decision-human-review/sessions/${sessionId}/answers`, {
        method: "POST",
        body: JSON.stringify({
          reviewCaseId: current.id,
          primaryOutcome,
          quality: quality || undefined,
          confidence,
          insufficientEvidence,
          ambiguousReading,
          notes: notes || undefined,
          requiredConfirmations: confirmations
            .split("\n")
            .map((s) => s.trim())
            .filter(Boolean)
            .slice(0, 12),
          triggeredInvalidations: invalidations
            .split("\n")
            .map((s) => s.trim())
            .filter(Boolean)
            .slice(0, 12),
        }),
      });
      setSubmitted((prev) => ({ ...prev, [current.id]: true }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Submit failed");
    } finally {
      setSaving(false);
    }
  }, [
    sessionId,
    current,
    primaryOutcome,
    quality,
    confidence,
    insufficientEvidence,
    ambiguousReading,
    notes,
    confirmations,
    invalidations,
  ]);

  const doReveal = useCallback(async () => {
    if (!sessionId || !current || !submitted[current.id]) return;
    setSaving(true);
    setError(null);
    try {
      const res = await api<RevealPayload>(
        `/api/internal/ai/decision-human-review/sessions/${sessionId}/reveal/${current.id}`,
        { method: "POST", body: "{}" },
      );
      setReveal(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Reveal failed");
    } finally {
      setSaving(false);
    }
  }, [sessionId, current, submitted]);

  return (
    <div className="min-h-screen bg-terminal-bg text-white p-4 md:p-6 space-y-4 font-mono">
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <Link href="/admin" className="text-terminal-accent hover:underline">
          Admin
        </Link>
        <span className="text-terminal-muted">/</span>
        <span>Human Methodology Review</span>
      </div>

      <div className="border border-amber-700/60 bg-amber-950/30 px-3 py-2 text-xs text-amber-100">
        mentorEligible: false — educational blind review only. No Mentor live. No BUY/SELL.
      </div>

      {error && (
        <div className="border border-red-800/70 bg-red-950/40 px-3 py-2 text-xs text-red-100">{error}</div>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => void startSession()}
          className="text-[11px] border border-terminal-border px-3 py-1.5 rounded-sm hover:text-terminal-accent"
        >
          {sessionId ? "Nueva sesion ciega" : "Iniciar sesion ciega"}
        </button>
      </div>

      {!current ? (
        <p className="text-sm text-terminal-muted">Inicia una sesion para ver escenarios (sin PASS/FAIL previo).</p>
      ) : (
        <>
          {/* 1) SCENARIO FIRST */}
          <section className="space-y-2 border border-terminal-border p-4 rounded-sm">
            <div className="text-[10px] uppercase tracking-wider text-terminal-muted">
              Caso {idx + 1}/{cases.length} · {current.displayCohort}
            </div>
            <h1 className="text-base text-white leading-relaxed whitespace-pre-wrap">{current.scenarioText}</h1>
            {current.scenarioContext ? (
              <p className="text-xs text-terminal-muted whitespace-pre-wrap">{current.scenarioContext}</p>
            ) : null}
            {current.lensesHint?.length ? (
              <p className="text-[11px] text-terminal-muted">Lentes: {current.lensesHint.join(", ")}</p>
            ) : null}
          </section>

          {/* 2) STRUCTURED ANSWER FORM — hide PASS/FAIL / engine / golden until submit+reveal */}
          <section className="space-y-3 border border-terminal-border p-4 rounded-sm">
            <h2 className="text-xs uppercase tracking-wider text-terminal-muted">Respuesta estructurada</h2>
            <label className="block text-[11px] space-y-1">
              <span>Outcome primario</span>
              <select
                className="w-full bg-black/40 border border-terminal-border px-2 py-1"
                value={primaryOutcome}
                onChange={(e) => setPrimaryOutcome(e.target.value as DecisionPathOutcome)}
              >
                {OUTCOMES.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-[11px] space-y-1">
              <span>Quality (opcional)</span>
              <select
                className="w-full bg-black/40 border border-terminal-border px-2 py-1"
                value={quality}
                onChange={(e) => setQuality(e.target.value as DecisionQualityCategory | "")}
              >
                <option value="">—</option>
                {QUALITIES.map((q) => (
                  <option key={q} value={q}>
                    {q}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-[11px] space-y-1">
              <span>Confianza</span>
              <select
                className="w-full bg-black/40 border border-terminal-border px-2 py-1"
                value={confidence}
                onChange={(e) => setConfidence(e.target.value as "LOW" | "MEDIUM" | "HIGH")}
              >
                <option value="LOW">LOW</option>
                <option value="MEDIUM">MEDIUM</option>
                <option value="HIGH">HIGH</option>
              </select>
            </label>
            <div className="flex flex-wrap gap-4 text-[11px]">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={insufficientEvidence}
                  onChange={(e) => setInsufficientEvidence(e.target.checked)}
                />
                Evidencia insuficiente
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={ambiguousReading}
                  onChange={(e) => setAmbiguousReading(e.target.checked)}
                />
                Lectura ambigua
              </label>
            </div>
            <label className="block text-[11px] space-y-1">
              <span>Confirmaciones (una por linea)</span>
              <textarea
                className="w-full bg-black/40 border border-terminal-border px-2 py-1 min-h-[60px]"
                value={confirmations}
                onChange={(e) => setConfirmations(e.target.value)}
              />
            </label>
            <label className="block text-[11px] space-y-1">
              <span>Invalidaciones (una por linea)</span>
              <textarea
                className="w-full bg-black/40 border border-terminal-border px-2 py-1 min-h-[60px]"
                value={invalidations}
                onChange={(e) => setInvalidations(e.target.value)}
              />
            </label>
            <label className="block text-[11px] space-y-1">
              <span>Notas</span>
              <textarea
                className="w-full bg-black/40 border border-terminal-border px-2 py-1 min-h-[60px]"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                maxLength={1200}
              />
            </label>

            {/* 3) SUBMIT */}
            <button
              type="button"
              disabled={saving}
              onClick={() => void submit()}
              className="text-[11px] border border-terminal-accent text-terminal-accent px-3 py-1.5 rounded-sm disabled:opacity-50"
            >
              Enviar respuesta (sin revelar)
            </button>
          </section>

          {/* 4) REVEAL ONLY AFTER SUBMIT */}
          {submitted[current.id] ? (
            <section className="space-y-2 border border-terminal-border p-4 rounded-sm">
              <button
                type="button"
                disabled={saving}
                onClick={() => void doReveal()}
                className="text-[11px] border border-terminal-border px-3 py-1.5 rounded-sm hover:text-terminal-accent"
              >
                Revelar engine / golden / diff
              </button>
              {reveal ? (
                <div className="text-xs space-y-1 text-terminal-muted">
                  <div>Clase: {reveal.comparison.comparisonClass}</div>
                  <div>Human: {reveal.comparison.humanOutcome}</div>
                  <div>Engine: {reveal.engineOutcome ?? "null"}</div>
                  <div>Golden: {reveal.goldenExpectOutcomes.join(", ")}</div>
                  {reveal.proposal ? (
                    <div>
                      Proposal PENDING: {reveal.proposal.id} · {reveal.proposal.suggestedAction} (no auto-apply)
                    </div>
                  ) : null}
                </div>
              ) : (
                <p className="text-[11px] text-terminal-muted">
                  PASS/FAIL y outcomes de engine/golden ocultos hasta revelar.
                </p>
              )}
            </section>
          ) : (
            <p className="text-[11px] text-terminal-muted">
              Envía la respuesta antes de ver engine, golden o PASS/FAIL.
            </p>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              disabled={idx <= 0}
              onClick={() => {
                setIdx((i) => Math.max(0, i - 1));
                setReveal(null);
              }}
              className="text-[11px] border border-terminal-border px-2 py-1 disabled:opacity-40"
            >
              Anterior
            </button>
            <button
              type="button"
              disabled={idx >= cases.length - 1}
              onClick={() => {
                setIdx((i) => Math.min(cases.length - 1, i + 1));
                setReveal(null);
              }}
              className="text-[11px] border border-terminal-border px-2 py-1 disabled:opacity-40"
            >
              Siguiente
            </button>
          </div>
        </>
      )}
    </div>
  );
}
