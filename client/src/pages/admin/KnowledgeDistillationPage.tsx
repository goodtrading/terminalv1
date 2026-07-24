/**
 * AI-7.3.4 Knowledge Distillation Lab — flag-gated admin UI.
 * credentials:include. No Brain apply. Challenge never answers.
 */
import { useCallback, useEffect, useState } from "react";
import { AdminShell } from "@/components/admin/shell";
import {
  fetchAdaptiveQueue,
  fetchChallenges,
  fetchEvolution,
  fetchGaps,
  fetchHeatmaps,
  fetchIndependentEvidenceAudit,
  fetchKdStatus,
  fetchLatest,
  fetchProposals,
  runDistillation,
  runIndependentEvidenceAudit,
  runStrictDistillation,
} from "@/lib/knowledgeDistillation/knowledgeDistillationApi";

type Mode =
  | "overview"
  | "distillation"
  | "heatmaps"
  | "gaps"
  | "adaptive"
  | "challenge"
  | "proposals"
  | "evolution"
  | "independentEvidence";

export default function KnowledgeDistillationPage() {
  const [mode, setMode] = useState<Mode>("overview");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [note, setNote] = useState("");
  const [latest, setLatest] = useState<unknown>(null);
  const [heatmaps, setHeatmaps] = useState<{ conflict: unknown; coverage: unknown } | null>(null);
  const [gaps, setGaps] = useState<unknown[]>([]);
  const [queue, setQueue] = useState<unknown[]>([]);
  const [challenges, setChallenges] = useState<unknown[]>([]);
  const [scores, setScores] = useState<unknown[]>([]);
  const [proposals, setProposals] = useState<unknown[]>([]);
  const [evolution, setEvolution] = useState<unknown>(null);
  const [independentAudit, setIndependentAudit] = useState<unknown>(null);
  const [sessionIdsRaw, setSessionIdsRaw] = useState("");
  const [strictPreview, setStrictPreview] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    try {
      const s = await fetchKdStatus();
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

  const onRun = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const ids = sessionIdsRaw
        .split(/[\s,]+/)
        .map((x) => x.trim())
        .filter(Boolean);
      if (!ids.length) {
        setError("Provide explicit HUMAN sourceSessionIds (strict /runs). Empty-body /run is deprecated.");
        return;
      }
      const preview = await runStrictDistillation({ sourceSessionIds: ids, dryRun: true });
      setStrictPreview(JSON.stringify(preview.preview ?? preview, null, 2));
      const ok = window.confirm("Confirm strict distillation once for these session IDs?");
      if (!ok) return;
      const res = await runStrictDistillation({ sourceSessionIds: ids, dryRun: false, persist: true });
      setLatest(res.result);
      setMode("distillation");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Run failed");
    } finally {
      setLoading(false);
    }
  }, [sessionIdsRaw]);

  const onLatest = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchLatest();
      setLatest(res.result);
      setMode("distillation");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Latest failed");
    } finally {
      setLoading(false);
    }
  }, []);

  const onHeatmaps = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchHeatmaps();
      setHeatmaps({ conflict: res.conflict, coverage: res.coverage });
      setMode("heatmaps");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Heatmaps failed");
    } finally {
      setLoading(false);
    }
  }, []);

  const onGaps = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchGaps();
      setGaps(res.gaps);
      setMode("gaps");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gaps failed");
    } finally {
      setLoading(false);
    }
  }, []);

  const onQueue = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchAdaptiveQueue();
      setQueue(res.queue);
      setMode("adaptive");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Queue failed");
    } finally {
      setLoading(false);
    }
  }, []);

  const onChallenge = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchChallenges();
      setChallenges(res.challenges);
      setScores(res.scores);
      setMode("challenge");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Challenge failed");
    } finally {
      setLoading(false);
    }
  }, []);

  const onProposals = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchProposals();
      setProposals(res.proposals);
      setMode("proposals");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Proposals failed");
    } finally {
      setLoading(false);
    }
  }, []);

  const onEvolution = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchEvolution();
      setEvolution(res.report);
      setMode("evolution");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Evolution failed");
    } finally {
      setLoading(false);
    }
  }, []);

  const onIndependentEvidence = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const existing = await fetchIndependentEvidenceAudit();
      if (existing.audit) {
        setIndependentAudit(existing.audit);
      } else {
        const created = await runIndependentEvidenceAudit();
        setIndependentAudit(created.audit);
      }
      setMode("independentEvidence");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Independent evidence audit failed");
    } finally {
      setLoading(false);
    }
  }, []);

  const tabs: { id: Mode; label: string; action?: () => void }[] = [
    { id: "overview", label: "Overview" },
    { id: "distillation", label: "Distillation", action: () => void onLatest() },
    { id: "independentEvidence", label: "Independent Evidence Audit", action: () => void onIndependentEvidence() },
    { id: "heatmaps", label: "Heatmaps", action: () => void onHeatmaps() },
    { id: "gaps", label: "Gaps", action: () => void onGaps() },
    { id: "adaptive", label: "Adaptive Queue", action: () => void onQueue() },
    { id: "challenge", label: "Challenge Me", action: () => void onChallenge() },
    { id: "proposals", label: "Compressed Proposals", action: () => void onProposals() },
    { id: "evolution", label: "Evolution Report", action: () => void onEvolution() },
  ];

  return (
    <AdminShell
      title="Knowledge Distillation"
      description="Deterministic distillation lab. mentorEligible=false · brainMutate=false · autoApply=false. Proposals always PENDING."
    >
      <div className="max-w-5xl mx-auto space-y-4 font-mono text-sm" data-testid="knowledge-distillation-lab">
        <div className="border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs space-y-1">
          <div>Flag GOODTRADING_AI_KNOWLEDGE_DISTILLATION_ENABLED (default OFF).</div>
          <div>mentorEligible=false · brainMutate=false · autoApply=false · openAi=false · deterministic only.</div>
          <div>Proposals always PENDING · NOT_SAFE_FOR_BRAIN_APPLICATION · no Approve-to-Brain.</div>
          <div>Challenge Me never answers — prioritizes hypothesis-discriminating prompts.</div>
          {enabled === false && <div className="text-red-300">Lab disabled until flag enabled.</div>}
          {note && <div className="text-terminal-muted">{note}</div>}
        </div>

        {error && <div className="border border-red-500/40 bg-red-950/30 px-3 py-2 text-xs text-red-100">{error}</div>}

        <div className="flex flex-wrap gap-2">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              data-testid={`kd-mode-${t.id}`}
              className={`border px-2 py-1 text-[11px] ${mode === t.id ? "border-terminal-accent text-terminal-accent" : "border-terminal-border"}`}
              onClick={() => {
                setMode(t.id);
                t.action?.();
              }}
            >
              {t.label}
            </button>
          ))}
          <button type="button" disabled={loading} onClick={() => void loadStatus()} className="border border-terminal-border px-2 py-1 text-[11px]">
            Refresh Status
          </button>
          <button type="button" disabled={loading} onClick={() => void onRun()} className="border border-terminal-accent text-terminal-accent px-2 py-1 text-[11px]">
            Run Distillation (strict session IDs)
          </button>
        </div>

        <label className="block text-[11px] space-y-1">
          <span>sourceSessionIds (HUMAN completed, comma/space separated)</span>
          <input
            className="w-full bg-terminal-bg border border-terminal-border px-2 py-1"
            value={sessionIdsRaw}
            onChange={(e) => setSessionIdsRaw(e.target.value)}
            placeholder="uuid-1 uuid-2"
            data-testid="kd-source-session-ids"
          />
        </label>
        {strictPreview && (
          <pre className="border border-terminal-border p-2 text-[10px] overflow-auto max-h-32">{strictPreview}</pre>
        )}

        {mode === "overview" && (
          <section className="border border-terminal-border p-3 text-xs space-y-2" data-testid="kd-overview">
            <p>
              Convierte respuestas humanas (Human Review + Critical Calibration) en conocimiento estructurado: clustering,
              compresión, heatmaps, gaps, cola adaptativa y Challenge Me. No genera preguntas aleatorias adicionales fuera
              de drivers HIGH_CONFLICT / HIGH_UNCERTAINTY / LOW_COVERAGE / LOW_CONFIDENCE.
            </p>
            <p className="text-terminal-muted">Prioridad cola: HIGH_CONFLICT → HIGH_INFORMATION_GAIN → LOW_COVERAGE → LOW_CONFIDENCE → RANDOM.</p>
          </section>
        )}

        {mode === "distillation" && (
          <pre className="border border-terminal-border p-3 text-[11px] overflow-auto max-h-[560px]" data-testid="kd-distillation">
            {latest
              ? JSON.stringify(
                  {
                    // redact observation texts in overview dump size — show counts
                    observationCount: Array.isArray((latest as { observations?: unknown[] }).observations)
                      ? (latest as { observations: unknown[] }).observations.length
                      : 0,
                    clusterCount: Array.isArray((latest as { clusters?: unknown[] }).clusters)
                      ? (latest as { clusters: unknown[] }).clusters.length
                      : 0,
                    compression: (latest as { compression?: unknown }).compression,
                    mentorEligible: false,
                    brainMutate: false,
                  },
                  null,
                  2,
                )
              : "Sin run. Ejecutá Run Distillation."}
          </pre>
        )}

        {mode === "heatmaps" && (
          <pre className="border border-terminal-border p-3 text-[11px] overflow-auto max-h-[560px]" data-testid="kd-heatmaps">
            {heatmaps ? JSON.stringify(heatmaps, null, 2) : "Sin heatmaps. Corré distillation primero."}
          </pre>
        )}

        {mode === "gaps" && (
          <pre className="border border-terminal-border p-3 text-[11px] overflow-auto max-h-[560px]" data-testid="kd-gaps">
            {JSON.stringify(gaps, null, 2)}
          </pre>
        )}

        {mode === "adaptive" && (
          <pre className="border border-terminal-border p-3 text-[11px] overflow-auto max-h-[560px]" data-testid="kd-adaptive">
            {JSON.stringify(queue, null, 2)}
          </pre>
        )}

        {mode === "challenge" && (
          <section className="space-y-2" data-testid="kd-challenge">
            <p className="text-[11px] text-amber-200">Challenge Me — never answers. Discriminates between methodological hypotheses.</p>
            <pre className="border border-terminal-border p-3 text-[11px] overflow-auto max-h-[400px]">{JSON.stringify(challenges, null, 2)}</pre>
            <pre className="border border-terminal-border p-3 text-[11px] overflow-auto max-h-[240px]">{JSON.stringify(scores, null, 2)}</pre>
          </section>
        )}

        {mode === "proposals" && (
          <section className="space-y-2" data-testid="kd-proposals">
            <p className="text-[11px] text-amber-200">PENDING only · NOT_SAFE_FOR_BRAIN_APPLICATION · no Apply button.</p>
            <pre className="border border-terminal-border p-3 text-[11px] overflow-auto max-h-[560px]">{JSON.stringify(proposals, null, 2)}</pre>
          </section>
        )}

        {mode === "evolution" && (
          <pre className="border border-terminal-border p-3 text-[11px] overflow-auto max-h-[560px]" data-testid="kd-evolution">
            {evolution ? JSON.stringify(evolution, null, 2) : "Sin evolution report."}
          </pre>
        )}

        {mode === "independentEvidence" && (
          <section className="space-y-2" data-testid="kd-independent-evidence">
            <p className="text-[11px] text-amber-200">
              Independent Evidence Audit — documents ≠ independent humans. Original run immutable. LIMITED_HUMAN_SAMPLE.
            </p>
            <pre className="border border-terminal-border p-3 text-[11px] overflow-auto max-h-[560px]">
              {independentAudit
                ? JSON.stringify(
                    (() => {
                      const a = independentAudit as {
                        documentObservationCount?: number;
                        decisionUnitCount?: number;
                        independentSupportMetrics?: unknown;
                        conflictAudit?: unknown;
                        proposalAudit?: unknown;
                        gapAudit?: unknown;
                        challengeAudit?: unknown;
                        utilityReassessment?: unknown;
                        compressionAudit?: unknown;
                        confidenceAudit?: { sampleSafety?: string; hasMature?: boolean; avgScore?: number };
                        warnings?: string[];
                        sourceRunId?: string;
                        sourceFingerprint?: string;
                        brainMutate?: boolean;
                        autoApply?: boolean;
                        mentorEligible?: boolean;
                        containsAnswerText?: boolean;
                      };
                      return {
                        documents: a.documentObservationCount,
                        humanDecisions: a.decisionUnitCount,
                        independentSupportMetrics: a.independentSupportMetrics,
                        conflictAudit: a.conflictAudit,
                        proposalSupportCorrected: a.proposalAudit,
                        gaps: a.gapAudit,
                        challenges: a.challengeAudit,
                        compression: a.compressionAudit,
                        confidence: {
                          sampleSafety: a.confidenceAudit?.sampleSafety,
                          hasMature: a.confidenceAudit?.hasMature,
                          avgScore: a.confidenceAudit?.avgScore,
                        },
                        utility: a.utilityReassessment,
                        limitedSampleWarning: a.confidenceAudit?.sampleSafety === "LIMITED_HUMAN_SAMPLE",
                        sourceRunId: a.sourceRunId,
                        sourceFingerprint: a.sourceFingerprint,
                        brainMutate: false,
                        autoApply: false,
                        mentorEligible: false,
                        containsAnswerText: false,
                        warnings: a.warnings,
                      };
                    })(),
                    null,
                    2,
                  )
                : "Sin audit. Abrí Independent Evidence Audit para generar/cargar."}
            </pre>
          </section>
        )}
      </div>
    </AdminShell>
  );
}