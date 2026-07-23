/**
 * AI-7.3.1 Critical Calibration active-learning session (blind until submit).
 * Never answers for Ignacio. No Brain mutation. No suggested answers in blind packet.
 */
import { randomUUID } from "node:crypto";
import type {
  CalibrationAnswerType,
  CalibrationObservation,
  CalibrationObservationKind,
  CalibrationPostRevealAction,
  CalibrationQuestion,
  CalibrationSessionKind,
} from "@shared/goodTradingAiCriticalCalibration";
import {
  calibrationObservationSchema,
  CRITICAL_CALIBRATION_SCHEMA_VERSION,
  MUTATION_KINDS,
} from "@shared/goodTradingAiCriticalCalibration";
import { generateScenarios, scenarioToDecisionQuestion } from "./scenarioGenerator";
import { applyMutation } from "./mutationEngine";
import { selectHighInfoQuestions } from "./questionGenerator";
import {
  getCriticalCalibrationMemory,
  type CriticalCalibrationSessionRecord,
} from "./memoryStore";
import { reviewScenario } from "./criticalReviewer";
import { createProposalsFromReview } from "./proposalEngine";
import { evaluateDecisionGraph } from "../decision/decisionGraphEngine";
import { retrieveKnowledge } from "../knowledge/retrieve";

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

export type RevealPacket = {
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
  mentorEligible: false;
  brainMutated: false;
};

export type SessionProgressSummary = {
  sessionId: string;
  seed: string;
  kind: CalibrationSessionKind;
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

export function generateBatchWithMutations(input: {
  seed: string;
  scenarioCount: number;
  mutationDepth?: number;
  maxMutationsPerBase?: number;
  nowMs?: number;
}) {
  const mutationDepth = input.mutationDepth ?? 1;
  const maxMutationsPerBase = Math.min(14, Math.max(0, input.maxMutationsPerBase ?? 3));
  const bases = generateScenarios({
    count: input.scenarioCount,
    seed: input.seed,
    nowMs: input.nowMs,
  });
  const out = [...bases];
  if (mutationDepth >= 1 && maxMutationsPerBase > 0) {
    for (let i = 0; i < bases.length; i++) {
      const base = bases[i]!;
      for (let m = 0; m < maxMutationsPerBase; m++) {
        const kind = MUTATION_KINDS[(i + m) % MUTATION_KINDS.length]!;
        out.push(applyMutation(base, kind));
      }
    }
  }
  return {
    bases,
    scenarios: out,
    realMarketData: false as const,
    mentorEligible: false as const,
    seed: input.seed,
    scenarioCount: bases.length,
    expandedCount: out.length,
    mutationDepth,
    maxMutationsPerBase,
  };
}

export function buildActiveLearningQueue(input: {
  seed: string;
  scenarioCount?: number;
  targetMin?: number;
  targetMax?: number;
}) {
  const batch = generateBatchWithMutations({
    seed: input.seed,
    scenarioCount: input.scenarioCount ?? 120,
    mutationDepth: 1,
    maxMutationsPerBase: 3,
  });
  const top = selectHighInfoQuestions({
    scenarios: batch.scenarios,
    limit: 20,
    targetMin: input.targetMin ?? 15,
    targetMax: input.targetMax ?? 20,
  });
  return { batch, questions: top, mentorEligible: false as const };
}

export function startCriticalCalibrationSession(input?: {
  seed?: string;
  initialQuestionCount?: number;
  kind?: CalibrationSessionKind;
  label?: string;
}): {
  session: CriticalCalibrationSessionRecord;
  blindQuestions: BlindQuestionPacket[];
  questions: CalibrationQuestion[];
  mentorEligible: false;
  brainMutate: false;
  autoApply: false;
} {
  const seed = input?.seed ?? "73001";
  const initialQuestionCount = Math.min(20, Math.max(1, input?.initialQuestionCount ?? 15));
  const { questions } = buildActiveLearningQueue({ seed, scenarioCount: 120 });
  const selected = questions.slice(0, initialQuestionCount);
  const store = getCriticalCalibrationMemory();
  store.saveQuestionQueue(questions);
  const session: CriticalCalibrationSessionRecord = {
    id: randomUUID(),
    seed,
    questionIds: selected.map((q) => q.id),
    createdAtMs: Date.now(),
    mentorEligible: false,
    brainMutate: false,
    autoApply: false,
    appendOnly: true,
    version: CRITICAL_CALIBRATION_SCHEMA_VERSION,
    kind: input?.kind === "TECHNICAL" ? "TECHNICAL" : "HUMAN",
    revealedQuestionIds: [],
    deferredQuestionIds: [],
    archived: false,
    label: input?.label?.slice(0, 80),
  };
  store.saveSession(session);
  const blindQuestions: BlindQuestionPacket[] = selected.map((q) => ({
    sessionId: session.id,
    questionId: q.id,
    prompt: q.prompt,
    questionType: q.questionType,
    relatedLenses: q.relatedLenses,
    allowsDepends: true,
    confidenceOptions: ["LOW", "MEDIUM", "HIGH"],
    mentorEligible: false,
  }));
  return {
    session,
    blindQuestions,
    questions: selected,
    mentorEligible: false,
    brainMutate: false,
    autoApply: false,
  };
}

export function getBlindPacket(sessionId: string, questionId: string): BlindQuestionPacket {
  const store = getCriticalCalibrationMemory();
  const session = store.getSession(sessionId);
  if (!session) throw new Error("SESSION_NOT_FOUND");
  if (!session.questionIds.includes(questionId)) throw new Error("QUESTION_NOT_IN_SESSION");
  const q = store.listQuestions().find((x) => x.id === questionId);
  if (!q) throw new Error("QUESTION_NOT_FOUND");
  return {
    sessionId,
    questionId: q.id,
    prompt: q.prompt,
    questionType: q.questionType,
    relatedLenses: q.relatedLenses,
    allowsDepends: true,
    confidenceOptions: ["LOW", "MEDIUM", "HIGH"],
    mentorEligible: false,
  };
}

function lines(v: unknown, max = 12): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out = v.map((x) => String(x ?? "").trim()).filter(Boolean).slice(0, max);
  return out.length ? out : undefined;
}

export function submitCalibrationAnswer(input: {
  sessionId: string;
  questionId: string;
  humanNote?: string;
  answerText?: string;
  answerType?: CalibrationAnswerType;
  conditions?: string[];
  minimumConfirmations?: string[];
  invalidations?: string[];
  confidence: "LOW" | "MEDIUM" | "HIGH";
  observationKind?: CalibrationObservationKind;
  revisionOf?: string;
  postRevealAction?: CalibrationPostRevealAction;
}): CalibrationObservation {
  const store = getCriticalCalibrationMemory();
  const session = store.getSession(input.sessionId);
  if (!session) throw new Error("SESSION_NOT_FOUND");
  if (session.archived) throw new Error("SESSION_ARCHIVED");
  if (!session.questionIds.includes(input.questionId)) throw new Error("QUESTION_NOT_IN_SESSION");
  const text = String(input.answerText ?? input.humanNote ?? "").trim();
  if (!text) throw new Error("ANSWER_TEXT_REQUIRED");
  const prior = store.listObservations(input.sessionId).filter((o) => o.questionId === input.questionId);
  const latest = prior.sort((a, b) => b.createdAtMs - a.createdAtMs)[0];
  const observationKind: CalibrationObservationKind =
    input.observationKind ??
    (input.postRevealAction ? "ADDENDUM" : latest ? "REVISION" : "ANSWER");
  if (observationKind === "REVISION" && !input.revisionOf && latest) {
    // append-only: never overwrite; link revision to prior id
  }
  const obs = calibrationObservationSchema.parse({
    id: "obs_" + randomUUID().slice(0, 10),
    sessionId: input.sessionId,
    questionId: input.questionId,
    humanNote: text.slice(0, 2000),
    answerType: input.answerType,
    conditions: lines(input.conditions),
    minimumConfirmations: lines(input.minimumConfirmations),
    invalidations: lines(input.invalidations),
    confidence: input.confidence,
    allowsDepends: true,
    observationKind,
    revisionOf: input.revisionOf ?? (observationKind === "REVISION" ? latest?.id : undefined),
    postRevealAction: input.postRevealAction,
    createdAtMs: Date.now(),
    mentorEligible: false,
  });
  store.saveObservation(obs);
  if (input.postRevealAction === "DEFER") {
    const deferred = Array.from(new Set([...(session.deferredQuestionIds ?? []), input.questionId]));
    store.saveSession({ ...session, deferredQuestionIds: deferred, revealedQuestionIds: session.revealedQuestionIds ?? [], kind: session.kind ?? "HUMAN", archived: session.archived ?? false });
  }
  return obs;
}

export function revealAfterCalibrationSubmit(sessionId: string, questionId: string): RevealPacket {
  const store = getCriticalCalibrationMemory();
  const session = store.getSession(sessionId);
  if (!session) throw new Error("SESSION_NOT_FOUND");
  const obs = store.listObservations(sessionId).find((o) => o.questionId === questionId);
  if (!obs) throw new Error("ANSWER_REQUIRED_BEFORE_REVEAL");

  const scenarios = generateScenarios({ count: 1, seed: session.seed + "_" + questionId });
  const scenario = scenarios[0]!;
  const question = scenarioToDecisionQuestion(scenario);
  const knowledgeEntries = retrieveKnowledge({ query: question, maxResults: 6 }).matches.map((m) => m.entry);
  const evalResult = evaluateDecisionGraph({
    question,
    scenarioLabel: scenario.id,
    knowledgeEntries,
    marketSnapshot: null,
    forceUntrusted: true,
  });
  const engineOutcome = evalResult.clientSafe?.primaryOutcome ?? null;
  const review = reviewScenario({ scenario, engineOutcome, humanOutcome: null });
  const proposals = createProposalsFromReview(review, scenario);
  const prop = proposals[0] ?? null;
  if (prop) store.saveProposal(prop);

  const evidenceStatus = review.findings[0]?.evidenceStatus ?? prop?.evidenceStatus ?? null;
  const revealedQuestionIds = Array.from(new Set([...(session.revealedQuestionIds ?? []), questionId]));
  store.saveSession({
    ...session,
    revealedQuestionIds,
    deferredQuestionIds: session.deferredQuestionIds ?? [],
    kind: session.kind ?? "HUMAN",
    archived: session.archived ?? false,
  });

  return {
    sessionId,
    questionId,
    humanNote: obs.humanNote,
    engineOutcome,
    criticalObjection: review.findings[0]?.message ?? null,
    alternativeReading: review.taxonomy,
    evidenceStatus,
    proposalCandidate: prop
      ? {
          id: prop.id,
          title: prop.title,
          status: "PENDING",
          evidenceStatus: prop.evidenceStatus,
          autoApply: false,
          brainMutate: false,
        }
      : null,
    validationRequired: [
      "Human review required before any Brain change",
      "POTENTIAL_EDGE is HYPOTHESIS_ONLY / EDGE_NOT_EMPIRICALLY_VALIDATED",
      "PROPOSAL_SCHEMA_NOT_READY_FOR_BRAIN_APPLICATION",
      prop ? "minSupportRequired=" + prop.minSupportRequired : "No proposal candidate",
    ],
    proposalSchemaWarning: "PROPOSAL_SCHEMA_NOT_READY_FOR_BRAIN_APPLICATION",
    mentorEligible: false,
    brainMutated: false,
  };
}

function normalizeSession(session: CriticalCalibrationSessionRecord): CriticalCalibrationSessionRecord {
  return {
    ...session,
    kind: session.kind ?? "HUMAN",
    revealedQuestionIds: session.revealedQuestionIds ?? [],
    deferredQuestionIds: session.deferredQuestionIds ?? [],
    archived: session.archived ?? false,
  };
}

export function summarizeQueue(questions: CalibrationQuestion[]): QueueSummary {
  const typeDistribution: Record<string, number> = {};
  const gainBandDistribution: Record<string, number> = {};
  const lensCoverage: Record<string, number> = {};
  for (const q of questions) {
    typeDistribution[q.questionType] = (typeDistribution[q.questionType] ?? 0) + 1;
    gainBandDistribution[q.expectedInformationGainBand] =
      (gainBandDistribution[q.expectedInformationGainBand] ?? 0) + 1;
    for (const lens of q.relatedLenses) {
      lensCoverage[lens] = (lensCoverage[lens] ?? 0) + 1;
    }
  }
  return {
    count: questions.length,
    typeDistribution,
    gainBandDistribution,
    lensCoverage,
    mentorEligible: false,
  };
}

export function getSessionProgress(sessionId: string): SessionProgressSummary {
  const store = getCriticalCalibrationMemory();
  const raw = store.getSession(sessionId);
  if (!raw) throw new Error("SESSION_NOT_FOUND");
  const session = normalizeSession(raw);
  const answeredCount = session.questionIds.filter((id) =>
    store.listObservations(sessionId).some((o) => o.questionId === id && o.observationKind !== "ADDENDUM"),
  ).length;
  const revealedCount = session.revealedQuestionIds.length;
  const deferredCount = session.deferredQuestionIds.length;
  const remainingCount = Math.max(0, session.questionIds.length - answeredCount);
  const status: SessionProgressSummary["status"] = session.archived
    ? "ARCHIVED"
    : remainingCount === 0 && answeredCount > 0
      ? "COMPLETED"
      : "ACTIVE";
  return {
    sessionId: session.id,
    seed: session.seed,
    kind: session.kind,
    archived: session.archived,
    questionCount: session.questionIds.length,
    answeredCount,
    revealedCount,
    deferredCount,
    remainingCount,
    status,
    createdAtMs: session.createdAtMs,
    label: session.label,
    mentorEligible: false,
    brainMutate: false,
    autoApply: false,
    appendOnly: true,
  };
}

export function listSessionSummaries(): SessionProgressSummary[] {
  return getCriticalCalibrationMemory()
    .listSessions()
    .map((s) => getSessionProgress(s.id))
    .sort((a, b) => b.createdAtMs - a.createdAtMs);
}

export function resumeCriticalCalibrationSession(sessionId: string): {
  sessionId: string;
  questionCount: number;
  blindQuestions: BlindQuestionPacket[];
  progress: SessionProgressSummary;
  mentorEligible: false;
  brainMutate: false;
  autoApply: false;
} {
  const store = getCriticalCalibrationMemory();
  const raw = store.getSession(sessionId);
  if (!raw) throw new Error("SESSION_NOT_FOUND");
  const session = normalizeSession(raw);
  if (session.archived) throw new Error("SESSION_ARCHIVED");
  const questions = store.listQuestions();
  const byId = new Map(questions.map((q) => [q.id, q]));
  const blindQuestions: BlindQuestionPacket[] = session.questionIds.map((qid) => {
    const q = byId.get(qid);
    const packet: BlindQuestionPacket = {
      sessionId: session.id,
      questionId: qid,
      prompt: q?.prompt ?? `Question ${qid} (prompt unavailable — use blind endpoint)`,
      questionType: q?.questionType ?? "AMBIGUITY_RESOLUTION",
      relatedLenses: q?.relatedLenses ?? ["CONTEXT"],
      allowsDepends: true,
      confidenceOptions: ["LOW", "MEDIUM", "HIGH"],
      mentorEligible: false,
    };
    assertBlindPacketSafe(packet);
    return packet;
  });
  return {
    sessionId: session.id,
    questionCount: blindQuestions.length,
    blindQuestions,
    progress: getSessionProgress(session.id),
    mentorEligible: false,
    brainMutate: false,
    autoApply: false,
  };
}

export function archiveTechnicalSession(sessionId: string): SessionProgressSummary {
  const store = getCriticalCalibrationMemory();
  const raw = store.getSession(sessionId);
  if (!raw) throw new Error("SESSION_NOT_FOUND");
  const session = normalizeSession(raw);
  if (session.kind !== "TECHNICAL") throw new Error("ONLY_TECHNICAL_SESSIONS_ARCHIVABLE");
  store.saveSession({ ...session, archived: true });
  return getSessionProgress(sessionId);
}

export function assertBlindPacketSafe(packet: BlindQuestionPacket): void {
  const blob = JSON.stringify(packet).toLowerCase();
  const forbidden = [
    "enginepreference",
    "engine_outcome",
    "engineoutcome",
    "proposalrecommendation",
    "expectedoutcome",
    "rulechange",
    "steeringscore",
    "templateoutcome",
    "passfail",
    "suggestedanswer",
  ];
  for (const f of forbidden) {
    if (blob.includes(f)) throw new Error("BLINDNESS_VIOLATION: " + f);
  }
}
