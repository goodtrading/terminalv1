import { randomUUID } from "node:crypto";
import type { DecisionPathOutcome } from "@shared/goodTradingAiDecisionGraph";
import type {
  CalibrationMetrics,
  CriticalCalibrationReport,
  CriticalReview,
  ImprovementProposal,
  SyntheticScenario,
} from "@shared/goodTradingAiCriticalCalibration";
import { evaluateDecisionGraph } from "../decision/decisionGraphEngine";
import { retrieveKnowledge } from "../knowledge/retrieve";
import { reviewScenario } from "./criticalReviewer";
import { getCriticalCalibrationMemory } from "./memoryStore";
import { computeCalibrationMetrics } from "./metrics";
import { applyMutation } from "./mutationEngine";
import { createProposalsFromReview } from "./proposalEngine";
import { selectHighInfoQuestions } from "./questionGenerator";
import { buildCriticalCalibrationReport } from "./report";
import { generateScenarios, scenarioToDecisionQuestion } from "./scenarioGenerator";
import { MUTATION_KINDS } from "@shared/goodTradingAiCriticalCalibration";

const DEFAULT_BATCH = 24;
const MAX_BATCH = 200;

export type CalibrationBatchResult = {
  runId: string;
  scenarios: SyntheticScenario[];
  reviews: CriticalReview[];
  proposals: ImprovementProposal[];
  questions: ReturnType<typeof selectHighInfoQuestions>;
  metrics: CalibrationMetrics;
  report: CriticalCalibrationReport;
  mentorEligible: false;
  brainMutated: false;
};

export function runCalibrationBatch(input: {
  seed: string;
  count?: number;
  humanOutcomes?: Record<string, DecisionPathOutcome>;
  nowMs?: number;
}): CalibrationBatchResult {
  const count = Math.min(MAX_BATCH, Math.max(1, input.count ?? DEFAULT_BATCH));
  const nowMs = input.nowMs ?? Date.now();
  const started = nowMs;
  const scenarios = generateScenarios({ count, seed: input.seed, nowMs });
  const mutateEvery = Math.max(3, Math.floor(count / 4));
  const expanded: SyntheticScenario[] = [...scenarios];
  for (let i = 0; i < scenarios.length; i++) {
    if (i % mutateEvery === 0) {
      const kind = MUTATION_KINDS[i % MUTATION_KINDS.length]!;
      expanded.push(applyMutation(scenarios[i]!, kind));
    }
  }

  const reviews: CriticalReview[] = [];
  const proposals: ImprovementProposal[] = [];
  const store = getCriticalCalibrationMemory();

  for (const scenario of expanded.slice(0, count + Math.min(8, mutateEvery))) {
    const question = scenarioToDecisionQuestion(scenario);
    const knowledgeEntries = retrieveKnowledge({ query: question, maxResults: 6 }).matches.map((m) => m.entry);
    const evalResult = evaluateDecisionGraph({
      question,
      scenarioLabel: scenario.id,
      knowledgeEntries,
      marketSnapshot: null,
      forceUntrusted: true,
      nowMs,
    });
    const engineOutcome = evalResult.clientSafe?.primaryOutcome ?? null;
    const humanOutcome = input.humanOutcomes?.[scenario.id] ?? null;
    const review = reviewScenario({ scenario, engineOutcome, humanOutcome, nowMs });
    reviews.push(review);
    const props = createProposalsFromReview(review, scenario);
    for (const p of props) {
      store.saveProposal(p);
      proposals.push(p);
    }
  }

  const questions = selectHighInfoQuestions({ scenarios: expanded, limit: 20 });
  store.saveQuestionQueue(questions);
  const metrics = computeCalibrationMetrics({ reviews, proposals, scenarios: expanded });
  const report = buildCriticalCalibrationReport({ reviews, proposals, scenarios: expanded, metrics, questions, nowMs });
  const runId = randomUUID();
  store.saveRunRecord({
    id: runId,
    seed: input.seed,
    count,
    reviewCount: reviews.length,
    proposalCount: proposals.length,
    startedAtMs: started,
    finishedAtMs: Date.now(),
    mentorEligible: false,
    version: "1.0",
  });

  return {
    runId,
    scenarios: expanded,
    reviews,
    proposals,
    questions,
    metrics,
    report,
    mentorEligible: false,
    brainMutated: false,
  };
}
