/**
 * AI-7.3.3 Critical Calibration Lab — blind active-learning workflow UI.
 * Modes: Overview | Batch | Queue | Blind Session | Report
 * credentials:include only. No reveal prefetch. No Brain apply.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import type { CalibrationAnswerType, CalibrationPostRevealAction } from "@shared/goodTradingAiCriticalCalibration";
import {
  archiveTechnicalSession,
  buildActiveLearningQueue,
  fetchBlindPacket,
  fetchQueueSummary,
  fetchReport,
  fetchStatus,
  generateBatch,
  listSessions,
  revealAfterSubmit,
  resumeSession,
  startSession,
  submitAnswer,
  type BatchGenerateResult,
  type BlindQuestionPacket,
  type QueueSummary,
  type RevealResult,
  type SessionProgress,
} from "@/lib/criticalCalibration/criticalCalibrationApi";
import {
  assertClientBlindPacketSafe,
  canReveal,
  isLocalStorageAnswerAuthority,
  NOT_SAFE_FOR_BRAIN_APPLICATION,
  PROPOSAL_SCHEMA_WARNING,
  redactSessionId,
  SAFE_FOR_CALIBRATION_SESSION,
} from "@/lib/criticalCalibration/blindGuards";

type Mode = "overview" | "batch" | "queue" | "session" | "report";

const ANSWER_TYPES: CalibrationAnswerType[] = [
  "PRIORITIZE",
  "REQUIRE_CONFIRMATION",
  "REQUIRE_INVALIDATION",
  "DEPENDS",
  "MULTIPLE_VALID",
  "INSUFFICIENT_EVIDENCE",
];

const POST_ACTIONS: CalibrationPostRevealAction[] = [
  "AGREE",
  "DISAGREE",
  "NEEDS_CONDITIONS",
  "NEEDS_MORE_EVIDENCE",
  "DEFER",
  "ADD_NOTE",
];

function splitLines(raw: string): string[] {
  return raw
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 12);
}

export default function CriticalCalibrationLabPage() {
  const [mode, setMode] = useState<Mode>("overview");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [statusNote, setStatusNote] = useState<string>("");

  const [seed, setSeed] = useState("73001");
  const [scenarioCount, setScenarioCount] = useState(120);
  const [mutationDepth, setMutationDepth] = useState(1);
  const [maxMutationsPerBase, setMaxMutationsPerBase] = useState(3);
  const [batch, setBatch] = useState<BatchGenerateResult | null>(null);
  const [queueSummary, setQueueSummary] = useState<QueueSummary | null>(null);
  const [queueCount, setQueueCount] = useState(0);

  const [sessions, setSessions] = useState<SessionProgress[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [blindQuestions, setBlindQuestions] = useState<BlindQuestionPacket[]>([]);
  const [progress, setProgress] = useState<SessionProgress | null>(null);
  const [idx, setIdx] = useState(0);
  const [submitted, setSubmitted] = useState<Record<string, boolean>>({});
  const [revealed, setRevealed] = useState<Record<string, RevealResult>>({});
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);

  const [answerType, setAnswerType] = useState<CalibrationAnswerType>("DEPENDS");
  const [answerText, setAnswerText] = useState("");
  const [conditions, setConditions] = useState("");
  const [confirmations, setConfirmations] = useState("");
  const [invalidations, setInvalidations] = useState("");
  const [confidence, setConfidence] = useState<"LOW" | "MEDIUM" | "HIGH">("MEDIUM");
  const [postNote, setPostNote] = useState("");
  const [report, setReport] = useState<unknown>(null);

  void isLocalStorageAnswerAuthority();

  const current = blindQuestions[idx] ?? null;
  const currentSubmitted = current ? !!submitted[current.questionId] : false;
  const currentReveal = current ? revealed[current.questionId] : undefined;

  const loadStatus = useCallback(async () => {
    setError(null);
    try {
      const s = await fetchStatus();
      setEnabled(s.enabled);
      setStatusNote(s.note ?? "");
    } catch (e) {
      setEnabled(false);
      setError(e instanceof Error ? e.message : "Status unavailable");
    }
  }, []);

  const refreshSessions = useCallback(async () => {
    try {
      const res = await listSessions();
      setSessions(res.sessions);
    } catch {
      /* ignore list errors on first paint */
    }
  }, []);

  useEffect(() => {
    void loadStatus();
    void refreshSessions();
  }, [loadStatus, refreshSessions]);

  const onGenerateBatch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await generateBatch({
        seed,
        scenarioCount,
        mutationDepth,
        maxMutationsPerBase,
        realMarketData: false,
      });
      setBatch(res);
      setMode("batch");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Batch failed");
    } finally {
      setLoading(false);
    }
  }, [seed, scenarioCount, mutationDepth, maxMutationsPerBase]);

  const onBuildQueue = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await buildActiveLearningQueue({ seed, scenarioCount });
      setQueueCount(res.count);
      setQueueSummary(res.summary);
      setMode("queue");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Queue failed");
    } finally {
      setLoading(false);
    }
  }, [seed, scenarioCount]);

  const onLoadQueueSummary = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchQueueSummary();
      setQueueSummary(res.summary);
      setQueueCount(res.summary.count);
      setMode("queue");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Queue summary failed");
    } finally {
      setLoading(false);
    }
  }, []);

  const applySessionPayload = useCallback(
    (payload: {
      sessionId: string;
      blindQuestions: BlindQuestionPacket[];
      progress: SessionProgress;
    }) => {
      for (const q of payload.blindQuestions) {
        assertClientBlindPacketSafe(q as unknown as Record<string, unknown>);
      }
      setSessionId(payload.sessionId);
      setBlindQuestions(payload.blindQuestions);
      setProgress(payload.progress);
      setIdx(0);
      setSubmitted({});
      setRevealed({});
      setAnswerText("");
      setConditions("");
      setConfirmations("");
      setInvalidations("");
      setMode("session");
    },
    [],
  );

  const onStartSession = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await startSession({
        seed,
        initialQuestionCount: 15,
        kind: "HUMAN",
        label: "Ignacio production blind",
      });
      applySessionPayload(res);
      await refreshSessions();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Start session failed");
    } finally {
      setLoading(false);
    }
  }, [seed, applySessionPayload, refreshSessions]);

  const onResume = useCallback(
    async (id: string) => {
      setLoading(true);
      setError(null);
      try {
        const res = await resumeSession(id);
        applySessionPayload(res);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Resume failed");
      } finally {
        setLoading(false);
      }
    },
    [applySessionPayload],
  );

  const onSubmit = useCallback(async () => {
    if (!sessionId || !current) return;
    setLoading(true);
    setError(null);
    try {
      const res = await submitAnswer(sessionId, {
        questionId: current.questionId,
        answerText,
        answerType,
        conditions: splitLines(conditions),
        minimumConfirmations: splitLines(confirmations),
        invalidations: splitLines(invalidations),
        confidence,
      });
      setSubmitted((prev) => ({ ...prev, [current.questionId]: true }));
      setProgress(res.progress);
      setLastSavedAt(new Date().toISOString());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Submit failed");
    } finally {
      setLoading(false);
    }
  }, [sessionId, current, answerText, answerType, conditions, confirmations, invalidations, confidence]);

  const onReveal = useCallback(async () => {
    if (!sessionId || !current || !canReveal(currentSubmitted)) return;
    setLoading(true);
    setError(null);
    try {
      const res = await revealAfterSubmit(sessionId, current.questionId);
      setRevealed((prev) => ({ ...prev, [current.questionId]: res }));
      if (res.progress) setProgress(res.progress);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Reveal failed");
    } finally {
      setLoading(false);
    }
  }, [sessionId, current, currentSubmitted]);

  const onPostAction = useCallback(
    async (action: CalibrationPostRevealAction) => {
      if (!sessionId || !current || !currentSubmitted) return;
      setLoading(true);
      setError(null);
      try {
        const note =
          action === "ADD_NOTE"
            ? postNote || "ADD_NOTE"
            : `${action}${postNote ? `: ${postNote}` : ""}`;
        const res = await submitAnswer(sessionId, {
          questionId: current.questionId,
          answerText: note,
          answerType,
          conditions: splitLines(conditions),
          minimumConfirmations: splitLines(confirmations),
          invalidations: splitLines(invalidations),
          confidence,
          observationKind: "ADDENDUM",
          postRevealAction: action,
        });
        setProgress(res.progress);
        setLastSavedAt(new Date().toISOString());
        setPostNote("");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Post-reveal note failed");
      } finally {
        setLoading(false);
      }
    },
    [sessionId, current, currentSubmitted, postNote, answerType, conditions, confirmations, invalidations, confidence],
  );

  const onArchiveTech = useCallback(
    async (id: string) => {
      setLoading(true);
      setError(null);
      try {
        await archiveTechnicalSession(id);
        await refreshSessions();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Archive failed (HUMAN sessions cannot archive)");
      } finally {
        setLoading(false);
      }
    },
    [refreshSessions],
  );

  const onReport = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchReport();
      setReport(res.report);
      setMode("report");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Report failed");
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshBlindFromServer = useCallback(async () => {
    if (!sessionId || !current) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetchBlindPacket(sessionId, current.questionId);
      assertClientBlindPacketSafe(res.packet as unknown as Record<string, unknown>);
      setBlindQuestions((prev) => prev.map((q) => (q.questionId === current.questionId ? res.packet : q)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Blind packet failed");
    } finally {
      setLoading(false);
    }
  }, [sessionId, current]);

  const activeHuman = useMemo(
    () => sessions.find((s) => s.kind === "HUMAN" && s.status === "ACTIVE" && !s.archived),
    [sessions],
  );

  const modeTabs: { id: Mode; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "batch", label: "Batch" },
    { id: "queue", label: "Queue" },
    { id: "session", label: "Blind Session" },
    { id: "report", label: "Report" },
  ];

  return (
    <div className="min-h-screen bg-terminal-bg text-terminal-text px-4 py-6 font-mono text-sm" data-testid="critical-calibration-lab">
      <div className="max-w-5xl mx-auto space-y-4">
        <div className="flex items-center gap-2 text-xs">
          <Link href="/admin" className="text-terminal-accent hover:underline">
            Admin
          </Link>
          <span className="text-terminal-muted">/</span>
          <span>Critical Calibration Lab</span>
        </div>

        <div className="border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs space-y-1">
          <div>Flag GOODTRADING_AI_CRITICAL_CALIBRATION_ENABLED (default OFF). mentorEligible=false · brainMutate=false · realMarketData=false.</div>
          <div>
            {SAFE_FOR_CALIBRATION_SESSION} · {NOT_SAFE_FOR_BRAIN_APPLICATION} · {PROPOSAL_SCHEMA_WARNING}
          </div>
          <div>No Approve-to-Brain. No JWT prompt. credentials:include only.</div>
          {enabled === false && <div className="text-red-300">Lab disabled on server until flag enabled.</div>}
          {statusNote && <div className="text-terminal-muted">{statusNote}</div>}
        </div>

        {error && <div className="border border-red-500/40 bg-red-950/30 px-3 py-2 text-xs text-red-100">{error}</div>}

        <div className="flex flex-wrap gap-2">
          {modeTabs.map((t) => (
            <button
              key={t.id}
              type="button"
              data-testid={`cc-mode-${t.id}`}
              onClick={() => setMode(t.id)}
              className={`border px-2 py-1 text-[11px] ${mode === t.id ? "border-terminal-accent text-terminal-accent" : "border-terminal-border"}`}
            >
              {t.label}
            </button>
          ))}
          <button type="button" disabled={loading} onClick={() => void loadStatus()} className="border border-terminal-border px-2 py-1 text-[11px]">
            Refresh Status
          </button>
        </div>

        {mode === "overview" && (
          <section className="space-y-3 border border-terminal-border p-3" data-testid="cc-overview">
            <p className="text-xs text-terminal-muted">
              Flujo: Status → Batch seed 73001 → Active-learning queue → Sesión ciega 15Q → Submit → Reveal → Progress.
              Sugerencia: 5 preguntas por tanda.
            </p>
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={loading} onClick={() => void onGenerateBatch()} className="border border-terminal-accent text-terminal-accent px-2 py-1">
                Generate / Reuse Batch
              </button>
              <button type="button" disabled={loading} onClick={() => void onBuildQueue()} className="border border-terminal-border px-2 py-1">
                Build AL Queue
              </button>
              <button type="button" disabled={loading} onClick={() => void onStartSession()} className="border border-terminal-border px-2 py-1">
                Start Blind Session (15)
              </button>
              {activeHuman && (
                <button type="button" disabled={loading} onClick={() => void onResume(activeHuman.sessionId)} className="border border-emerald-600 text-emerald-300 px-2 py-1">
                  Resume {redactSessionId(activeHuman.sessionId)} ({activeHuman.answeredCount}/{activeHuman.questionCount})
                </button>
              )}
              <button type="button" disabled={loading} onClick={() => void onReport()} className="border border-terminal-border px-2 py-1">
                Load Report
              </button>
            </div>

            <div className="border border-terminal-border p-2 space-y-2">
              <div className="text-xs text-terminal-muted uppercase">Sessions</div>
              {sessions.length === 0 ? (
                <p className="text-[11px] text-terminal-muted">No sessions yet.</p>
              ) : (
                <ul className="space-y-1 text-[11px]">
                  {sessions.map((s) => (
                    <li key={s.sessionId} className="flex flex-wrap gap-2 items-center">
                      <span>
                        {redactSessionId(s.sessionId)} · {s.kind} · {s.status} · {s.answeredCount}/{s.questionCount} ans · {s.revealedCount} rev
                      </span>
                      {!s.archived && s.status !== "ARCHIVED" && (
                        <button type="button" className="underline" onClick={() => void onResume(s.sessionId)}>
                          Resume
                        </button>
                      )}
                      {s.kind === "TECHNICAL" && !s.archived && (
                        <button type="button" className="underline text-amber-300" onClick={() => void onArchiveTech(s.sessionId)}>
                          Archive tech
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        )}

        {mode === "batch" && (
          <section className="space-y-3 border border-terminal-border p-3" data-testid="cc-batch">
            <div className="grid md:grid-cols-2 gap-2 text-[11px]">
              <label>
                Seed
                <input className="w-full bg-terminal-bg border border-terminal-border mt-1 px-2 py-1" value={seed} onChange={(e) => setSeed(e.target.value)} />
              </label>
              <label>
                Scenario count
                <input
                  type="number"
                  className="w-full bg-terminal-bg border border-terminal-border mt-1 px-2 py-1"
                  value={scenarioCount}
                  onChange={(e) => setScenarioCount(Number(e.target.value) || 120)}
                />
              </label>
              <label>
                Mutation depth
                <input
                  type="number"
                  className="w-full bg-terminal-bg border border-terminal-border mt-1 px-2 py-1"
                  value={mutationDepth}
                  onChange={(e) => setMutationDepth(Number(e.target.value) || 1)}
                />
              </label>
              <label>
                Max mutations / base
                <input
                  type="number"
                  className="w-full bg-terminal-bg border border-terminal-border mt-1 px-2 py-1"
                  value={maxMutationsPerBase}
                  onChange={(e) => setMaxMutationsPerBase(Number(e.target.value) || 3)}
                />
              </label>
            </div>
            <p className="text-[11px] text-amber-200">realMarketData=false · SYNTHETIC ONLY · no live MarketSnapshot dump.</p>
            <button type="button" disabled={loading} onClick={() => void onGenerateBatch()} className="border border-terminal-accent text-terminal-accent px-2 py-1">
              Generate / Reuse Batch
            </button>
            {batch && (
              <pre className="text-[11px] border border-terminal-border p-2 overflow-auto" data-testid="cc-batch-summary">
                {JSON.stringify(
                  {
                    seed: batch.seed,
                    scenarioCount: batch.scenarioCount,
                    expandedCount: batch.expandedCount,
                    mutationDepth: batch.mutationDepth,
                    maxMutationsPerBase: batch.maxMutationsPerBase,
                    realMarketData: batch.realMarketData,
                    synthetic: batch.synthetic,
                    warning: batch.warning,
                    mentorEligible: batch.mentorEligible,
                    brainMutate: batch.brainMutate,
                  },
                  null,
                  2,
                )}
              </pre>
            )}
          </section>
        )}

        {mode === "queue" && (
          <section className="space-y-3 border border-terminal-border p-3" data-testid="cc-queue">
            <div className="flex gap-2">
              <button type="button" disabled={loading} onClick={() => void onBuildQueue()} className="border border-terminal-accent text-terminal-accent px-2 py-1">
                Build AL Queue
              </button>
              <button type="button" disabled={loading} onClick={() => void onLoadQueueSummary()} className="border border-terminal-border px-2 py-1">
                Load Summary
              </button>
            </div>
            <p className="text-[11px] text-terminal-muted">Resumen agregado únicamente — sin expected/engine/proposal/scores individuales.</p>
            {queueSummary ? (
              <pre className="text-[11px] border border-terminal-border p-2 overflow-auto" data-testid="cc-queue-summary">
                {JSON.stringify({ count: queueCount || queueSummary.count, ...queueSummary }, null, 2)}
              </pre>
            ) : (
              <p className="text-[11px] text-terminal-muted">Sin cola aún.</p>
            )}
          </section>
        )}

        {mode === "session" && (
          <section className="space-y-3" data-testid="cc-session">
            {!current ? (
              <div className="border border-terminal-border p-3 space-y-2">
                <p className="text-xs text-terminal-muted">No hay sesión ciega cargada.</p>
                <button type="button" disabled={loading} onClick={() => void onStartSession()} className="border border-terminal-accent text-terminal-accent px-2 py-1">
                  Start Blind Session (15)
                </button>
              </div>
            ) : (
              <>
                <div className="border border-terminal-border p-3 text-[11px] space-y-1" data-testid="cc-progress">
                  <div>
                    Session {redactSessionId(sessionId ?? "")} · Q {idx + 1}/{blindQuestions.length} · answered{" "}
                    {progress?.answeredCount ?? 0} · revealed {progress?.revealedCount ?? 0} · remaining{" "}
                    {progress?.remainingCount ?? blindQuestions.length} · deferred {progress?.deferredCount ?? 0}
                  </div>
                  <div>
                    confidence last form: {confidence}
                    {lastSavedAt ? ` · last saved ${lastSavedAt}` : ""}
                  </div>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <button type="button" disabled={idx <= 0} onClick={() => setIdx((i) => Math.max(0, i - 1))} className="border border-terminal-border px-2 py-1">
                      Previous
                    </button>
                    <button
                      type="button"
                      disabled={idx >= blindQuestions.length - 1}
                      onClick={() => setIdx((i) => Math.min(blindQuestions.length - 1, i + 1))}
                      className="border border-terminal-border px-2 py-1"
                    >
                      Next
                    </button>
                    <button type="button" onClick={() => setMode("overview")} className="border border-terminal-border px-2 py-1">
                      Resume later
                    </button>
                    <button type="button" disabled={loading} onClick={() => void refreshBlindFromServer()} className="border border-terminal-border px-2 py-1">
                      Re-fetch blind
                    </button>
                  </div>
                  <p className="text-terminal-muted">Sugerido: 5 por tanda. appendOnly=true · autoReveal=false · autoApply=false.</p>
                </div>

                <div className="border border-terminal-border p-3 space-y-2" data-testid="cc-blind-question">
                  <div className="text-xs text-terminal-muted uppercase">Blind question</div>
                  <div className="text-[11px] text-terminal-muted">
                    type={current.questionType} · lenses={current.relatedLenses.join(", ")} · allowsDepends=true
                  </div>
                  <pre className="whitespace-pre-wrap text-[12px]">{current.prompt}</pre>
                </div>

                <div className="border border-terminal-border p-3 space-y-2" data-testid="cc-answer-form">
                  <div className="text-xs text-terminal-muted uppercase">Answer (server-persisted; not localStorage authority)</div>
                  <label className="block text-[11px]">
                    answerType
                    <select
                      className="w-full bg-terminal-bg border border-terminal-border mt-1"
                      value={answerType}
                      onChange={(e) => setAnswerType(e.target.value as CalibrationAnswerType)}
                    >
                      {ANSWER_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-[11px]">
                    answerText
                    <textarea
                      className="w-full bg-terminal-bg border border-terminal-border mt-1 min-h-[88px] px-2 py-1"
                      value={answerText}
                      onChange={(e) => setAnswerText(e.target.value)}
                    />
                  </label>
                  <label className="block text-[11px]">
                    conditions (one per line)
                    <textarea className="w-full bg-terminal-bg border border-terminal-border mt-1 min-h-[56px] px-2 py-1" value={conditions} onChange={(e) => setConditions(e.target.value)} />
                  </label>
                  <label className="block text-[11px]">
                    minimumConfirmations
                    <textarea
                      className="w-full bg-terminal-bg border border-terminal-border mt-1 min-h-[56px] px-2 py-1"
                      value={confirmations}
                      onChange={(e) => setConfirmations(e.target.value)}
                    />
                  </label>
                  <label className="block text-[11px]">
                    invalidations
                    <textarea
                      className="w-full bg-terminal-bg border border-terminal-border mt-1 min-h-[56px] px-2 py-1"
                      value={invalidations}
                      onChange={(e) => setInvalidations(e.target.value)}
                    />
                  </label>
                  <label className="block text-[11px]">
                    confidence
                    <select
                      className="w-full bg-terminal-bg border border-terminal-border mt-1"
                      value={confidence}
                      onChange={(e) => setConfidence(e.target.value as "LOW" | "MEDIUM" | "HIGH")}
                    >
                      <option value="LOW">LOW</option>
                      <option value="MEDIUM">MEDIUM</option>
                      <option value="HIGH">HIGH</option>
                    </select>
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" disabled={loading || !answerText.trim()} onClick={() => void onSubmit()} className="border border-terminal-accent text-terminal-accent px-2 py-1">
                      Submit answer
                    </button>
                    <button
                      type="button"
                      disabled={loading || !canReveal(currentSubmitted)}
                      onClick={() => void onReveal()}
                      className="border border-terminal-border px-2 py-1 disabled:opacity-40"
                      data-testid="cc-reveal-btn"
                    >
                      Reveal (after submit)
                    </button>
                  </div>
                  {!currentSubmitted && <p className="text-[11px] text-terminal-muted">Reveal bloqueado hasta submit (ANSWER_REQUIRED_BEFORE_REVEAL).</p>}
                </div>

                {currentReveal && (
                  <div className="border border-amber-700/50 bg-amber-950/20 p-3 space-y-2 text-[11px]" data-testid="cc-reveal-panel">
                    <div className="uppercase text-amber-200">Reveal comparison</div>
                    <div>
                      <strong>Human:</strong> {currentReveal.humanNote}
                    </div>
                    <div>
                      <strong>Engine:</strong> {currentReveal.engineOutcome ?? "—"}
                    </div>
                    <div>
                      <strong>Critical objection:</strong> {currentReveal.criticalObjection ?? "—"}
                    </div>
                    <div>
                      <strong>Alternative:</strong> {currentReveal.alternativeReading ?? "—"}
                    </div>
                    <div>
                      <strong>Evidence status:</strong> {currentReveal.evidenceStatus ?? "—"}
                    </div>
                    <div>
                      <strong>Potential proposal:</strong>{" "}
                      {currentReveal.proposalCandidate
                        ? `${currentReveal.proposalCandidate.title} [${currentReveal.proposalCandidate.status}]`
                        : "—"}
                    </div>
                    <div className="text-amber-200">{currentReveal.proposalSchemaWarning} — no Brain apply.</div>
                    <p className="text-terminal-muted">EDGE / POTENTIAL_EDGE = HYPOTHETICAL|METHODOLOGICAL only. No Approve-to-Brain button.</p>
                    <label className="block">
                      Observation note
                      <input className="w-full bg-terminal-bg border border-terminal-border mt-1 px-2 py-1" value={postNote} onChange={(e) => setPostNote(e.target.value)} />
                    </label>
                    <div className="flex flex-wrap gap-1">
                      {POST_ACTIONS.map((a) => (
                        <button key={a} type="button" disabled={loading} className="border border-terminal-border px-2 py-1" onClick={() => void onPostAction(a)}>
                          {a}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </section>
        )}

        {mode === "report" && (
          <section className="border border-terminal-border p-3 space-y-2" data-testid="cc-report">
            <button type="button" disabled={loading} onClick={() => void onReport()} className="border border-terminal-border px-2 py-1">
              Refresh Report
            </button>
            <pre className="text-[11px] overflow-auto max-h-[480px]">{report ? JSON.stringify(report, null, 2) : "No report loaded."}</pre>
          </section>
        )}
      </div>
    </div>
  );
}