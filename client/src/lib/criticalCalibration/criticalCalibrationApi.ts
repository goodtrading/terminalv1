/**
 * AI-7.3.3 Critical Calibration client API.
 * credentials:include only — never stores JWT/cookies.
 * Never prefetches reveal data before submit.
 */
import { apiUrl } from "@/lib/apiBase";
import type {
  CalibrationAnswerType,
  CalibrationObservation,
  CalibrationObservationKind,
  CalibrationPostRevealAction,
  CalibrationQuestion,
} from "@shared/goodTradingAiCriticalCalibration";

export const CRITICAL_CALIBRATION_BASE = "/api/internal/ai/critical-calibration";

export type CriticalCalibrationApiError = Error & {
  code?: string;
  status?: number;
};

export type BlindQuestionPacket = {
  sessionId: string;
  questionId: string;
  prompt: string;
  questionType: CalibrationQuestion["questionType"];
  relatedLenses: CalibrationQuestion["relatedLenses"];
  allowsDepends: true;
  confidenceOptions: Array<"LOW" | "MEDIUM" | "HIGH">;
  mentorEligible: false;
};

export type SessionProgress = {
  sessionId: string;
  seed: string;
  kind: "HUMAN" | "TECHNICAL";
  archived: boolean;
  questionCount: number;
  answeredCount: number;
  revealedCount: number;
  deferredCount: number;
  remainingCount: number;
  status: "ACTIVE" | "COMPLETED" | "ARCHIVED";
  createdAtMs: number;
  label?: string;
  mentorEligible: false;
  brainMutate: false;
  autoApply: false;
  appendOnly: true;
};

export type QueueSummary = {
  count: number;
  typeDistribution: Record<string, number>;
  gainBandDistribution: Record<string, number>;
  lensCoverage: Record<string, number>;
  mentorEligible: false;
};

export type BatchGenerateResult = {
  seed: string;
  scenarioCount: number;
  expandedCount: number;
  mutationDepth: number;
  maxMutationsPerBase: number;
  realMarketData: false;
  mentorEligible: false;
  brainMutate: false;
  autoApply: false;
  synthetic: true;
  warning: string;
};

export type RevealResult = {
  sessionId: string;
  questionId: string;
  humanNote: string;
  engineOutcome: string | null;
  criticalObjection: string | null;
  alternativeReading: string | null;
  evidenceStatus: string | null;
  proposalCandidate: {
    id: string;
    title: string;
    status: "PENDING";
    evidenceStatus?: string;
    autoApply: false;
    brainMutate: false;
  } | null;
  validationRequired: string[];
  proposalSchemaWarning: "PROPOSAL_SCHEMA_NOT_READY_FOR_BRAIN_APPLICATION";
  progress?: SessionProgress;
  mentorEligible: false;
  brainMutated: false;
};

export type SubmitAnswerInput = {
  questionId: string;
  answerText: string;
  answerType: CalibrationAnswerType;
  conditions: string[];
  minimumConfirmations: string[];
  invalidations: string[];
  confidence: "LOW" | "MEDIUM" | "HIGH";
  observationKind?: CalibrationObservationKind;
  revisionOf?: string;
  postRevealAction?: CalibrationPostRevealAction;
};

async function ccFetch<T>(
  path: string,
  init?: RequestInit & { signal?: AbortSignal },
): Promise<T> {
  const res = await fetch(apiUrl(`${CRITICAL_CALIBRATION_BASE}${path}`), {
    credentials: "include",
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const err = new Error(
      typeof body.message === "string"
        ? body.message
        : typeof body.code === "string"
          ? body.code
          : `HTTP ${res.status}`,
    ) as CriticalCalibrationApiError;
    err.code = typeof body.code === "string" ? body.code : undefined;
    err.status = res.status;
    throw err;
  }
  return body as T;
}

export function fetchStatus(signal?: AbortSignal) {
  return ccFetch<{
    enabled: boolean;
    mentorEligible: false;
    openAi: false;
    chatLiveWiring: false;
    note?: string;
  }>("/status", { signal });
}

export function generateBatch(
  body: {
    seed?: string;
    scenarioCount?: number;
    mutationDepth?: number;
    maxMutationsPerBase?: number;
    realMarketData?: false;
  },
  signal?: AbortSignal,
) {
  return ccFetch<BatchGenerateResult>("/batch/generate", {
    method: "POST",
    body: JSON.stringify({ realMarketData: false, ...body }),
    signal,
  });
}

export function buildActiveLearningQueue(
  body: { seed?: string; scenarioCount?: number },
  signal?: AbortSignal,
) {
  return ccFetch<{ count: number; summary: QueueSummary; mentorEligible: false; realMarketData: false }>(
    "/questions/active-learning",
    { method: "POST", body: JSON.stringify(body), signal },
  );
}

export function fetchQueueSummary(signal?: AbortSignal) {
  return ccFetch<{ summary: QueueSummary; mentorEligible: false }>("/questions/summary", { signal });
}

export function startSession(
  body: {
    seed?: string;
    initialQuestionCount?: number;
    kind?: "HUMAN" | "TECHNICAL";
    label?: string;
  },
  signal?: AbortSignal,
) {
  return ccFetch<{
    sessionId: string;
    questionCount: number;
    blindQuestions: BlindQuestionPacket[];
    progress: SessionProgress;
    mentorEligible: false;
    brainMutate: false;
    autoApply: false;
    realMarketData: false;
  }>("/sessions/start", { method: "POST", body: JSON.stringify(body), signal });
}

export function listSessions(signal?: AbortSignal) {
  return ccFetch<{ sessions: SessionProgress[]; mentorEligible: false }>("/sessions", { signal });
}

export function resumeSession(sessionId: string, signal?: AbortSignal) {
  return ccFetch<{
    sessionId: string;
    questionCount: number;
    blindQuestions: BlindQuestionPacket[];
    progress: SessionProgress;
    mentorEligible: false;
    brainMutate: false;
    autoApply: false;
  }>(`/sessions/${encodeURIComponent(sessionId)}`, { signal });
}

export function fetchProgress(sessionId: string, signal?: AbortSignal) {
  return ccFetch<{ progress: SessionProgress; mentorEligible: false }>(
    `/sessions/${encodeURIComponent(sessionId)}/progress`,
    { signal },
  );
}

export function fetchBlindPacket(sessionId: string, questionId: string, signal?: AbortSignal) {
  return ccFetch<{ packet: BlindQuestionPacket; mentorEligible: false }>(
    `/sessions/${encodeURIComponent(sessionId)}/questions/${encodeURIComponent(questionId)}/blind`,
    { signal },
  );
}

export function submitAnswer(sessionId: string, input: SubmitAnswerInput, signal?: AbortSignal) {
  return ccFetch<{
    observation: CalibrationObservation;
    progress: SessionProgress;
    mentorEligible: false;
    revealed: false;
    brainMutate: false;
  }>(`/sessions/${encodeURIComponent(sessionId)}/answers`, {
    method: "POST",
    body: JSON.stringify({
      questionId: input.questionId,
      answerText: input.answerText,
      humanNote: input.answerText,
      answerType: input.answerType,
      conditions: input.conditions,
      minimumConfirmations: input.minimumConfirmations,
      invalidations: input.invalidations,
      confidence: input.confidence,
      observationKind: input.observationKind,
      revisionOf: input.revisionOf,
      postRevealAction: input.postRevealAction,
    }),
    signal,
  });
}

/** Only call after a successful submit for this question. */
export function revealAfterSubmit(sessionId: string, questionId: string, signal?: AbortSignal) {
  return ccFetch<RevealResult>(
    `/sessions/${encodeURIComponent(sessionId)}/questions/${encodeURIComponent(questionId)}/reveal`,
    { method: "POST", body: "{}", signal },
  );
}

export function archiveTechnicalSession(sessionId: string, signal?: AbortSignal) {
  return ccFetch<{ progress: SessionProgress; mentorEligible: false; brainMutate: false }>(
    `/sessions/${encodeURIComponent(sessionId)}/archive`,
    { method: "POST", body: "{}", signal },
  );
}

export function fetchReport(signal?: AbortSignal) {
  return ccFetch<{ report: unknown; mentorEligible: false; brainMutated: false }>("/report", { signal });
}