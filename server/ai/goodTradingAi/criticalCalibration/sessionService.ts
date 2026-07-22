/**
 * AI-7.3.1 Critical Calibration active-learning session (blind until submit).
 * Never answers for Ignacio. No Brain mutation. No suggested answers in blind packet.
 */
import { randomUUID } from "node:crypto";
import type { CalibrationObservation, CalibrationQuestion } from "@shared/goodTradingAiCriticalCalibration";
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
  proposalCandidate: {
    id: string;
    title: string;
    status: "PENDING";
    autoApply: false;
    brainMutate: false;
  } | null;
  validationRequired: string[];
  mentorEligible: false;
  brainMutated: false;
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
}): {
  session: CriticalCalibrationSessionRecord;
  blindQuestions: BlindQuestionPacket[];
  questions: CalibrationQuestion[];
  mentorEligible: false;
  brainMutate: false;
  autoApply: false;
} {
  const seed = input?.seed ?? "73001";
  const initialQuestionCount = Math.min(20, Math.max(10, input?.initialQuestionCount ?? 15));
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

export function submitCalibrationAnswer(input: {
  sessionId: string;
  questionId: string;
  humanNote: string;
  confidence: "LOW" | "MEDIUM" | "HIGH";
}): CalibrationObservation {
  const store = getCriticalCalibrationMemory();
  const session = store.getSession(input.sessionId);
  if (!session) throw new Error("SESSION_NOT_FOUND");
  if (!session.questionIds.includes(input.questionId)) throw new Error("QUESTION_NOT_IN_SESSION");
  const obs = calibrationObservationSchema.parse({
    id: "obs_" + randomUUID().slice(0, 10),
    sessionId: input.sessionId,
    questionId: input.questionId,
    humanNote: input.humanNote.slice(0, 2000),
    confidence: input.confidence,
    allowsDepends: true,
    createdAtMs: Date.now(),
    mentorEligible: false,
  });
  store.saveObservation(obs);
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

  return {
    sessionId,
    questionId,
    humanNote: obs.humanNote,
    engineOutcome,
    criticalObjection: review.findings[0]?.message ?? null,
    alternativeReading: review.taxonomy,
    proposalCandidate: prop
      ? {
          id: prop.id,
          title: prop.title,
          status: "PENDING",
          autoApply: false,
          brainMutate: false,
        }
      : null,
    validationRequired: [
      "Human review required before any Brain change",
      "POTENTIAL_EDGE is HYPOTHESIS_ONLY / EDGE_NOT_EMPIRICALLY_VALIDATED",
      prop ? "minSupportRequired=" + prop.minSupportRequired : "No proposal candidate",
    ],
    mentorEligible: false,
  brainMutated: false,
  };
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
