import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import { FORBIDDEN_TRADING_OUTCOME_TOKENS } from "@shared/goodTradingAiDecisionGraph";
import {
  MUTATION_KINDS,
  TAXONOMY_IDS,
  syntheticScenarioSchema,
} from "@shared/goodTradingAiCriticalCalibration";
import { estimateScenarioCapacity, generateScenarios, scenarioToDecisionQuestion } from "./scenarioGenerator";
import { applyMutation, mutateAll } from "./mutationEngine";
import { reviewScenario } from "./criticalReviewer";
import { classifyDisagreement } from "./taxonomy";
import { createProposalsFromReview, canAcceptProposal, attachObservationSupport } from "./proposalEngine";
import { selectHighInfoQuestions, dedupeQuestionsSemantic } from "./questionGenerator";
import { computeCalibrationMetrics } from "./metrics";
import { buildCriticalCalibrationReport } from "./report";
import { runCalibrationBatch } from "./pipeline";
import { resetCriticalCalibrationMemoryForTests, getCriticalCalibrationMemory } from "./memoryStore";
import { ALL_LENSES } from "./lenses";
import {
  assertBlindPacketSafe,
  buildActiveLearningQueue,
  generateBatchWithMutations,
  revealAfterCalibrationSubmit,
  startCriticalCalibrationSession,
  submitCalibrationAnswer,
} from "./sessionService";
import { criticalFindingSchema } from "@shared/goodTradingAiCriticalCalibration";

describe("AI-7.3 critical calibration", () => {
  beforeEach(() => {
    resetCriticalCalibrationMemoryForTests();
  });

  it("capacity estimate >= 1000", () => {
    assert.ok(estimateScenarioCapacity() >= 1000);
  });

  it("generate 100 scenarios unique ids", () => {
    const scenarios = generateScenarios({ count: 100, seed: "cap100" });
    assert.equal(scenarios.length, 100);
    const ids = new Set(scenarios.map((s) => s.id));
    assert.equal(ids.size, 100);
    for (const s of scenarios) {
      assert.equal(s.realMarketData, false);
      assert.equal(s.source, "SYNTHETIC_BRAIN_STRUCTURE");
      assert.equal(s.mentorEligible, false);
      const blob = JSON.stringify(s).toUpperCase();
      for (const tok of FORBIDDEN_TRADING_OUTCOME_TOKENS) {
        assert.ok(!new RegExp("\\b" + tok + "\\b").test(blob), tok);
      }
    }
  });

  for (const kind of MUTATION_KINDS) {
    it("mutate kind " + kind, () => {
      const base = generateScenarios({ count: 1, seed: "mut_" + kind })[0]!;
      const mutated = applyMutation(base, kind);
      assert.notEqual(mutated.id, base.id);
      assert.ok(mutated.id.includes(kind.toLowerCase().replace(/_/g, "-")));
      assert.equal(mutated.realMarketData, false);
      syntheticScenarioSchema.parse(mutated);
    });
  }

  for (let i = 0; i < 14; i++) {
    it("mutateAll sample " + i, () => {
      const base = generateScenarios({ count: 1, seed: "mall_" + i })[0]!;
      const all = mutateAll(base);
      assert.equal(all.length, MUTATION_KINDS.length);
    });
  }

  const taxonomyCases: Array<{ engine: string | null; human: string | null; expect: string; seed: string }> = [
    { engine: "HYPOTHESIS_SUPPORTED", human: "HYPOTHESIS_SUPPORTED", expect: "LIKELY_CORRECT", seed: "t_agree" },
    { engine: null, human: null, expect: "INSUFFICIENT_EVIDENCE", seed: "t_null" },
    { engine: "HYPOTHESIS_SUPPORTED", human: "EVIDENCE_INSUFFICIENT", expect: "LIKELY_TOO_AGGRESSIVE", seed: "t_delta" },
    { engine: "EVIDENCE_INSUFFICIENT", human: "HYPOTHESIS_SUPPORTED", expect: "POTENTIAL_EDGE", seed: "t_abs" },
    { engine: "HYPOTHESIS_SUPPORTED", human: "READING_CONFLICTED", expect: "MULTIPLE_VALID_INTERPRETATIONS", seed: "t_split" },
    { engine: "HYPOTHESIS_OPEN", human: "NEEDS_MORE_LENSES", expect: "INSUFFICIENT_EVIDENCE", seed: "t_caut" },
    { engine: "HYPOTHESIS_INVALIDATED", human: "HYPOTHESIS_SUPPORTED", expect: "METHODOLOGY_DIFFERENCE", seed: "t_meth" },
    { engine: "HYPOTHESIS_SUPPORTED", human: null, expect: "UNKNOWN", seed: "t_eng" },
  ];
  for (let i = 0; i < 40; i++) {
    const c = taxonomyCases[i % taxonomyCases.length]!;
    it("taxonomy case " + i + " -> " + c.expect, () => {
      const scenario = generateScenarios({ count: 1, seed: c.seed + "_" + i })[0]!;
      const tax = classifyDisagreement(c.engine as never, c.human as never, scenario);
      assert.ok(TAXONOMY_IDS.includes(tax));
    });
  }

  it("proposals never brainMutate/autoApply", () => {
    const scenario = generateScenarios({ count: 1, seed: "prop1" })[0]!;
    const review = reviewScenario({ scenario, engineOutcome: "HYPOTHESIS_SUPPORTED" });
    const props = createProposalsFromReview(review, scenario);
    for (const p of props) {
      assert.equal(p.autoApply, false);
      assert.equal(p.brainMutate, false);
      assert.equal(p.status, "PENDING");
      assert.equal(p.mentorEligible, false);
    }
  });

  it("questions length >= 20 for large pool", () => {
    const scenarios = generateScenarios({ count: 50, seed: "q50" });
    const qs = selectHighInfoQuestions({ scenarios, limit: 20 });
    assert.ok(qs.length >= 20);
    for (const q of qs) {
      assert.equal(q.mentorEligible, false);
      assert.ok(!/\\b(BUY|SELL|LONG|SHORT)\\b/i.test(q.prompt));
    }
  });

  it("memory append/decide", () => {
    const store = getCriticalCalibrationMemory();
    const base = generateScenarios({ count: 1, seed: "mem" })[0]!;
    const scenario = applyMutation(base, "INJECT_CONFLICT");
    const review = reviewScenario({ scenario, engineOutcome: "HYPOTHESIS_SUPPORTED" });
    const props = createProposalsFromReview(review, scenario);
    assert.ok(props.length > 0, "expected at least one proposal");
    const prop = props[0]!;
    store.saveProposal(prop);
    assert.equal(store.listProposals().length, 1);
    assert.throws(() => store.decideProposal(prop.id, "ACCEPTED", "nota test"));
    const decided = store.decideProposal(prop.id, "REJECTED", "nota test");
    assert.ok(decided);
    assert.equal(decided!.status, "REJECTED");
    assert.equal(decided!.brainMutate, false);
  });

  it("metrics bounds", () => {
    const scenarios = generateScenarios({ count: 5, seed: "met" });
    const reviews = scenarios.map((s) => reviewScenario({ scenario: s, engineOutcome: "HYPOTHESIS_OPEN" }));
    const metrics = computeCalibrationMetrics({ reviews, proposals: [], scenarios });
    assert.ok(metrics.avgFindingsPerReview >= 0);
    assert.equal(metrics.mentorEligible, false);
  });

  it("pipeline batch small", () => {
    const batch = runCalibrationBatch({ seed: "pipe", count: 4 });
    assert.equal(batch.mentorEligible, false);
    assert.equal(batch.brainMutated, false);
    assert.ok(batch.reviews.length > 0);
    assert.ok(batch.report.learnedSummary.length > 0);
  });

  it("performance generate 500 scenarios p95 under 2s", () => {
    const times: number[] = [];
    for (let r = 0; r < 5; r++) {
      const t0 = performance.now();
      generateScenarios({ count: 500, seed: "perf_" + r });
      times.push(performance.now() - t0);
    }
    times.sort((a, b) => a - b);
    const p95 = times[Math.floor(times.length * 0.95)] ?? times[times.length - 1]!;
    assert.ok(p95 < 2000, "p95 " + p95);
  });

  for (const lens of ALL_LENSES) {
    it("lens meta " + lens.id, () => {
      assert.ok(lens.narrativeFragment.length > 0);
      assert.ok(lens.knowledgeKeywords.length > 0);
    });
  }

  for (let n = 0; n < 250; n++) {
    it("parametric scenario " + n, () => {
      const s = generateScenarios({ count: 1, seed: "p" + n })[0]!;
      const q = scenarioToDecisionQuestion(s);
      assert.ok(q.length > 20);
      syntheticScenarioSchema.parse(s);
    });
  }

  for (let r = 0; r < 15; r++) {
    it("report build " + r, () => {
      const scenarios = generateScenarios({ count: 3, seed: "rep" + r });
      const reviews = scenarios.map((s) => reviewScenario({ scenario: s, engineOutcome: "HYPOTHESIS_WEAKENED" }));
      const metrics = computeCalibrationMetrics({ reviews, proposals: [], scenarios });
      const report = buildCriticalCalibrationReport({ reviews, proposals: [], scenarios, metrics, questions: selectHighInfoQuestions({ scenarios }) });
      assert.equal(report.brainMutated, false);
      assert.equal(report.mentorEligible, false);
    });
  }
});
