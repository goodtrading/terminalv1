import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import { criticalFindingSchema } from "@shared/goodTradingAiCriticalCalibration";
import { generateScenarios } from "./scenarioGenerator";
import { reviewScenario } from "./criticalReviewer";
import { createProposalsFromReview, canAcceptProposal, attachObservationSupport } from "./proposalEngine";
import { selectHighInfoQuestions, dedupeQuestionsSemantic } from "./questionGenerator";
import { computeCalibrationMetrics } from "./metrics";
import { buildCriticalCalibrationReport } from "./report";
import { resetCriticalCalibrationMemoryForTests } from "./memoryStore";
import {
  assertBlindPacketSafe,
  buildActiveLearningQueue,
  generateBatchWithMutations,
  revealAfterCalibrationSubmit,
  startCriticalCalibrationSession,
  submitCalibrationAnswer,
} from "./sessionService";

describe("AI-7.3.1 semantics and active learning", () => {
  beforeEach(() => {
    resetCriticalCalibrationMemoryForTests();
  });

  it("POTENTIAL_EDGE always carries EDGE_NOT_EMPIRICALLY_VALIDATED", () => {
    const scenario = generateScenarios({ count: 1, seed: "edge_sem" })[0]!;
    const abs = scenario.lenses.find((l) => l.lens === "ABSORPTION");
    if (abs) {
      abs.strength = "STRONG";
      abs.polarity = "SUPPORTIVE";
    } else {
      scenario.lenses.push({ lens: "ABSORPTION", strength: "STRONG", polarity: "SUPPORTIVE" });
    }
    const review = reviewScenario({ scenario, engineOutcome: "EVIDENCE_INSUFFICIENT" });
    const edge = review.findings.find((f) => f.kind === "POTENTIAL_EDGE");
    assert.ok(edge, "expected POTENTIAL_EDGE finding");
    assert.ok(edge!.warnings.includes("EDGE_NOT_EMPIRICALLY_VALIDATED"));
    assert.ok(edge!.evidenceStatus === "HYPOTHETICAL" || edge!.evidenceStatus === "METHODOLOGICAL");
    assert.equal(edge!.findingClass, "RESEARCH_HYPOTHESIS");
    assert.ok(!/\bis a proven edge\b/i.test(edge!.message));
    assert.ok(/EDGE_NOT_EMPIRICALLY_VALIDATED/.test(edge!.message) || edge!.warnings.includes("EDGE_NOT_EMPIRICALLY_VALIDATED"));
    assert.ok(!/\b(BUY|SELL|LONG|SHORT)\b/i.test(JSON.stringify(review)));
    criticalFindingSchema.parse(edge);
  });

  it("rejects empirically validated evidenceStatus without gate", () => {
    assert.throws(() =>
      criticalFindingSchema.parse({
        id: "f_bad",
        kind: "POTENTIAL_EDGE",
        findingClass: "RESEARCH_HYPOTHESIS",
        evidenceStatus: "FORWARD_VALIDATED",
        severity: "MEDIUM",
        message: "bad empirical claim without validation",
        warnings: ["EDGE_NOT_EMPIRICALLY_VALIDATED"],
      }),
    );
  });

  it("questions expose decomposed info-gain and no suggested answer", () => {
    const scenarios = generateScenarios({ count: 40, seed: "alq" });
    const qs = selectHighInfoQuestions({ scenarios, limit: 20, targetMin: 15, targetMax: 20 });
    assert.ok(qs.length >= 15 && qs.length <= 20);
    for (const q of qs) {
      assert.ok(q.scoreComponents);
      assert.ok(q.whyThisQuestion.length >= 8);
      assert.ok(q.affectedConcepts.length >= 1);
      assert.equal(q.allowsDepends, true);
      assert.ok(!/suggested answer/i.test(q.prompt));
      assert.ok(!/\b(BUY|SELL|LONG|SHORT)\b/i.test(q.prompt));
    }
    const types = new Set(qs.map((q) => q.questionType));
    assert.ok(types.has("PRIORITY_CHOICE") || types.has("CONDITIONAL_PRIORITY"));
    assert.ok(types.has("CONFIRMATION_REQUIREMENT"));
    assert.ok(types.has("INVALIDATION_REQUIREMENT"));
  });

  it("semantic dedupe removes duplicate concept keys", () => {
    const qs = selectHighInfoQuestions({ scenarios: generateScenarios({ count: 10, seed: "dedupe" }), limit: 20 });
    const doubled = [...qs, ...qs];
    const deduped = dedupeQuestionsSemantic(doubled);
    assert.equal(deduped.length, qs.length);
  });

  it("proposals require conditions and support thresholds", () => {
    const scenario = generateScenarios({ count: 1, seed: "prop_safe" })[0]!;
    const review = reviewScenario({ scenario, engineOutcome: "HYPOTHESIS_SUPPORTED" });
    const props = createProposalsFromReview(review, scenario);
    for (const p of props) {
      assert.equal(p.autoApply, false);
      assert.equal(p.brainMutate, false);
      assert.equal(p.status, "PENDING");
      assert.ok(p.conditions.length >= 1);
      assert.ok(p.minSupportRequired >= 1);
      assert.ok(p.evidenceStatus === "METHODOLOGICAL" || p.evidenceStatus === "HYPOTHETICAL");
    }
    const critical = props.find(
      (p) => p.priority === "CRITICAL" || p.kind === "REMOVE_DEAD_RULE" || p.kind === "NEW_INVALIDATION",
    );
    if (critical) {
      const gate = canAcceptProposal(critical, []);
      assert.equal(gate.ok, false);
    }
  });

  it("single observation cannot accept high-impact proposal", () => {
    const scenario = generateScenarios({ count: 1, seed: "support1" })[0]!;
    const review = reviewScenario({ scenario, engineOutcome: "HYPOTHESIS_SUPPORTED" });
    let prop = createProposalsFromReview(review, scenario).find((p) => p.minSupportRequired >= 2);
    if (!prop) {
      const base = createProposalsFromReview(review, scenario)[0]!;
      prop = { ...base, minSupportRequired: 3, priority: "CRITICAL", kind: "REMOVE_DEAD_RULE" };
    }
    prop = attachObservationSupport(prop, "obs_only_one");
    const gate = canAcceptProposal(prop, [
      {
        id: "obs_only_one",
        sessionId: "s1",
        questionId: "q1",
        humanNote: "depende del contexto",
        confidence: "MEDIUM",
        allowsDepends: true,
        createdAtMs: Date.now(),
        mentorEligible: false,
      },
    ]);
    assert.equal(gate.ok, false);
  });

  it("batch seed 73001 generates 120 bases with mutations", () => {
    const batch = generateBatchWithMutations({
      seed: "73001",
      scenarioCount: 120,
      mutationDepth: 1,
      maxMutationsPerBase: 3,
    });
    assert.equal(batch.scenarioCount, 120);
    assert.equal(batch.realMarketData, false);
    assert.ok(batch.expandedCount > 120);
    assert.ok(batch.scenarios.every((s) => s.realMarketData === false));
  });

  it("active learning queue 15-20 for seed 73001", () => {
    const queue = buildActiveLearningQueue({ seed: "73001", scenarioCount: 120 });
    assert.ok(queue.questions.length >= 15 && queue.questions.length <= 20);
  });

  it("session starts blind without answering for Ignacio", () => {
    const started = startCriticalCalibrationSession({ seed: "73001", initialQuestionCount: 15 });
    assert.equal(started.mentorEligible, false);
    assert.equal(started.brainMutate, false);
    assert.equal(started.autoApply, false);
    assert.equal(started.blindQuestions.length, 15);
    for (const q of started.blindQuestions) {
      assertBlindPacketSafe(q);
      assert.ok(!("engineOutcome" in q));
    }
    assert.throws(() => revealAfterCalibrationSubmit(started.session.id, started.blindQuestions[0]!.questionId));
  });

  it("reveal requires answer first then shows comparison", () => {
    const started = startCriticalCalibrationSession({ seed: "tech_reveal", initialQuestionCount: 10 });
    const qid = started.blindQuestions[0]!.questionId;
    submitCalibrationAnswer({
      sessionId: started.session.id,
      questionId: qid,
      humanNote: "Depende de confirmacion adicional de liquidez",
      confidence: "MEDIUM",
    });
    const revealed = revealAfterCalibrationSubmit(started.session.id, qid);
    assert.equal(revealed.mentorEligible, false);
    assert.equal(revealed.brainMutated, false);
    assert.ok(Array.isArray(revealed.validationRequired));
  });

  it("report without human answers uses OBSERVED/QUESTION_PENDING/HYPOTHESIS_ONLY", () => {
    const scenarios = generateScenarios({ count: 4, seed: "rep_lab" });
    const reviews = scenarios.map((s) => reviewScenario({ scenario: s, engineOutcome: "HYPOTHESIS_OPEN" }));
    const metrics = computeCalibrationMetrics({ reviews, proposals: [], scenarios });
    const report = buildCriticalCalibrationReport({
      reviews,
      proposals: [],
      scenarios,
      metrics,
      questions: selectHighInfoQuestions({ scenarios }),
      hasHumanAnswers: false,
    });
    assert.ok(report.labels.includes("OBSERVED_BY_ENGINE"));
    assert.ok(report.labels.includes("QUESTION_PENDING"));
    assert.ok(report.labels.includes("HYPOTHESIS_ONLY"));
    assert.ok(!report.labels.includes("LEARNED_FROM_IGNACIO"));
    assert.equal(report.schemaVersion, "1.1");
  });
});
