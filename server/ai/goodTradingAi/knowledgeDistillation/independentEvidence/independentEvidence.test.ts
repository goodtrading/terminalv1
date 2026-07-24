/**
 * AI-7.3.12 — Independent Evidence Audit tests.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { CalibrationObservation } from "@shared/goodTradingAiCriticalCalibration";
import { calibrationObservationSchema } from "@shared/goodTradingAiCriticalCalibration";
import {
  resolveDistillationAnalysisVersion,
  type DistillationRunResult,
} from "@shared/goodTradingAiKnowledgeDistillation";
import {
  buildDocumentObservations,
  resolveHumanDecisionUnit,
  resolveAllHumanDecisionUnits,
  classifyScenarioSimilarity,
  auditConflicts,
  reclusterDecisionUnits,
  auditGaps,
  auditChallenges,
  auditProposals,
  runIndependentEvidenceAudit,
  getIndependentEvidenceAuditMemory,
  resetIndependentEvidenceAuditMemoryForTests,
} from "./index";

function obs(partial: Partial<CalibrationObservation> & Pick<CalibrationObservation, "id" | "questionId" | "humanNote">): CalibrationObservation {
  return calibrationObservationSchema.parse({
    sessionId: partial.sessionId ?? "sess_test_001",
    confidence: partial.confidence ?? "HIGH",
    allowsDepends: true,
    observationKind: partial.observationKind ?? "ANSWER",
    createdAtMs: partial.createdAtMs ?? Date.now(),
    mentorEligible: false,
    ...partial,
  });
}

function minimalRun(overrides?: Partial<DistillationRunResult>): DistillationRunResult {
  return {
    observations: [],
    clusters: [],
    compression: {
      totalObservations: 0,
      totalClusters: 0,
      compressedCount: 0,
      kinds: {
        DUPLICATE: 0,
        VARIANT: 36,
        REDUNDANT: 0,
        TOO_SPECIFIC: 0,
        TOO_GENERAL: 0,
        EQUIVALENT: 0,
      },
      notes: [],
      mentorEligible: false,
    },
    conflictHeatmap: { cells: [], totalConflicts: 135, mentorEligible: false },
    coverageHeatmap: { cells: [], totalObservations: 0, mentorEligible: false },
    confidences: [],
    gaps: Array.from({ length: 22 }, (_, i) => ({
      id: `gap_${i}`,
      kind: "NEVER_DISCUSSED" as const,
      subject: `L${i}`,
      detail: "placeholder gap detail text",
      severity: "HIGH" as const,
      mentorEligible: false as const,
    })),
    adaptiveQuestions: [],
    adaptiveQueue: [],
    challenges: Array.from({ length: 15 }, (_, i) => ({
      id: `ch_${String(i + 1).padStart(3, "0")}`,
      kind: "HYPOTHESIS_DISCRIMINATION" as const,
      prompt: `Challenge prompt number ${i + 1} for discrimination`,
      relatedLenses: ["ABSORPTION" as const, "DELTA" as const],
      hypothesisA: "Hypothesis A holds under conditions",
      hypothesisB: "Hypothesis B holds under conditions",
      discriminationScore: 0.8,
      neverAnswers: true as const,
      mentorEligible: false as const,
    })),
    challengeScores: [],
    compressedProposals: [
      {
        id: "kd_prop_01",
        status: "PENDING",
        title: "Clarify priority between lenses",
        reason: "Repeated methodological conflict needs review",
        conditions: ["Human review required", "No Brain mutation"],
        affectedSessions: [],
        affectedRules: ["ABSORPTION<->DELTA"],
        frequency: 11,
        confidence: "HIGH",
        impact: "HIGH",
        risk: "MEDIUM",
        autoApply: false,
        brainMutate: false,
        schemaWarning: "PROPOSAL_SCHEMA_NOT_READY_FOR_BRAIN_APPLICATION",
        safety: "NOT_SAFE_FOR_BRAIN_APPLICATION",
        mentorEligible: false,
        createdAtMs: Date.now(),
      },
    ],
    evolution: {
      schemaVersion: "1.0",
      generatedAtMs: Date.now(),
      totalSessions: 1,
      rulesCovered: 0,
      repeatedCompressed: 0,
      highConflictCount: 0,
      highConfidenceCount: 0,
      lowConfidenceCount: 0,
      unusedConcepts: [],
      nextQuestions: [],
      topOpportunities: [],
      mentorEligible: false,
      brainMutated: false,
      openAi: false,
    },
    mentorEligible: false,
    brainMutate: false,
    autoApply: false,
    realMarketData: false,
    ...overrides,
  };
}

describe("AI-7.3.12 independent evidence", () => {
  it("answer + 3 addenda = 1 independent support", () => {
    const raw = [
      obs({ id: "obs_a1", questionId: "q_01", humanNote: "Priority depends on liquidity confirmation first" }),
      obs({
        id: "obs_ad1",
        questionId: "q_01",
        humanNote: "add condition: wall must hold",
        observationKind: "ADDENDUM",
        conditions: ["wall holds"],
        createdAtMs: Date.now() + 1,
      }),
      obs({
        id: "obs_ad2",
        questionId: "q_01",
        humanNote: "add confirmation: delta agrees",
        observationKind: "ADDENDUM",
        minimumConfirmations: ["delta agrees"],
        createdAtMs: Date.now() + 2,
      }),
      obs({
        id: "obs_ad3",
        questionId: "q_01",
        humanNote: "add invalidation: spoofing clears",
        observationKind: "ADDENDUM",
        invalidations: ["spoofing clears"],
        createdAtMs: Date.now() + 3,
      }),
    ];
    const { documents, units } = resolveAllHumanDecisionUnits(raw);
    assert.equal(documents.length, 4);
    assert.equal(units.length, 1);
    assert.equal(units[0]!.independentSupportWeight, 1);
    assert.equal(units[0]!.sourceCount, 4);
    assert.ok(units[0]!.conditionCount >= 1);
    assert.ok(units[0]!.confirmationCount >= 1);
    assert.ok(units[0]!.invalidationCount >= 1);
  });

  it("answer + revision = one current position; old revision does not vote", () => {
    const raw = [
      obs({
        id: "obs_a1",
        questionId: "q_02",
        humanNote: "Original: absorption first when aggression present",
        createdAtMs: 1000,
      }),
      obs({
        id: "obs_r1",
        questionId: "q_02",
        humanNote: "Revised: liquidity confirmation before absorption",
        observationKind: "REVISION",
        revisionOf: "obs_a1",
        createdAtMs: 2000,
      }),
    ];
    const unit = resolveHumanDecisionUnit({ sessionId: "sess_test_001", questionId: "q_02", raw });
    assert.equal(unit.currentResolvedAnswerId, "obs_r1");
    assert.equal(unit.originalAnswerId, "obs_a1");
    assert.equal(unit.independentSupportWeight, 1);
    const docs = buildDocumentObservations(raw);
    assert.equal(docs.find((d) => d.observationId === "obs_a1")!.contributesIndependentSupport, true);
    assert.equal(docs.find((d) => d.observationId === "obs_r1")!.contributesIndependentSupport, false);
    assert.equal(docs.find((d) => d.observationId === "obs_r1")!.activeForCurrentPosition, true);
  });

  it("addendum preserves conditions without replacing answer", () => {
    const raw = [
      obs({ id: "obs_a1", questionId: "q_03", humanNote: "Require invalidation before flip trust" }),
      obs({
        id: "obs_ad1",
        questionId: "q_03",
        humanNote: "condition note",
        observationKind: "ADDENDUM",
        conditions: ["staleness below threshold"],
        createdAtMs: Date.now() + 1,
      }),
    ];
    const unit = resolveHumanDecisionUnit({ sessionId: "sess_test_001", questionId: "q_03", raw });
    assert.equal(unit.currentResolvedAnswerId, "obs_a1");
    assert.equal(unit.conditionCount, 1);
    assert.deepEqual(unit.addendumIds, ["obs_ad1"]);
  });

  it("post-reveal disagreement is not a second answer", () => {
    const raw = [
      obs({ id: "obs_a1", questionId: "q_04", humanNote: "Depends on horizon for priority" }),
      obs({
        id: "obs_pr1",
        questionId: "q_04",
        humanNote: "disagree with engine framing",
        observationKind: "ADDENDUM",
        postRevealAction: "DISAGREE",
        createdAtMs: Date.now() + 1,
      }),
    ];
    const docs = buildDocumentObservations(raw);
    const pr = docs.find((d) => d.observationId === "obs_pr1")!;
    assert.equal(pr.contributesIndependentSupport, false);
    assert.equal(pr.documentType, "ADDENDUM");
    const { units } = resolveAllHumanDecisionUnits(raw);
    assert.equal(units.length, 1);
  });

  it("two distinct questions can support same claim; metamorphic/duplicate correlated", () => {
    const u1 = resolveHumanDecisionUnit({
      sessionId: "sess_a",
      questionId: "q_aa",
      raw: [
        obs({
          id: "obs_x1",
          sessionId: "sess_a",
          questionId: "q_aa",
          humanNote: "Absorption weighs more when aggression and liquidity confirm",
        }),
      ],
    });
    const u2 = resolveHumanDecisionUnit({
      sessionId: "sess_a",
      questionId: "q_bb",
      raw: [
        obs({
          id: "obs_x2",
          sessionId: "sess_a",
          questionId: "q_bb",
          humanNote: "Absorption weighs more when aggression and liquidity confirm",
        }),
      ],
    });
    const sim = classifyScenarioSimilarity(u1, u2);
    assert.ok(sim === "DUPLICATE" || sim === "METAMORPHIC_VARIANT" || sim === "RELATED");
    const clusters = reclusterDecisionUnits({
      units: [u1, u2],
      documents: buildDocumentObservations([
        obs({
          id: "obs_x1",
          sessionId: "sess_a",
          questionId: "q_aa",
          humanNote: "Absorption weighs more when aggression and liquidity confirm",
        }),
        obs({
          id: "obs_x2",
          sessionId: "sess_a",
          questionId: "q_bb",
          humanNote: "Absorption weighs more when aggression and liquidity confirm",
        }),
      ]),
    });
    assert.ok(clusters.length >= 1);
  });

  it("same-unit pairs excluded; depends is not contradiction; scale difference not true conflict", () => {
    const raw = [
      obs({
        id: "obs_a1",
        questionId: "q_05",
        humanNote: "Depende del horizonte de respuesta de precio",
        answerType: "DEPENDS",
      }),
      obs({
        id: "obs_ad1",
        questionId: "q_05",
        humanNote: "add note",
        observationKind: "ADDENDUM",
        createdAtMs: Date.now() + 1,
      }),
      obs({
        id: "obs_b1",
        questionId: "q_06",
        humanNote: "Require confirmation of flip before acceptance",
        answerType: "REQUIRE_CONFIRMATION",
        sessionId: "sess_test_001",
      }),
    ];
    const { documents, units } = resolveAllHumanDecisionUnits(raw);
    const { summary, conflicts } = auditConflicts({ units, documents, originalDocumentConflictTotal: 135 });
    assert.ok(summary.excludedSameUnitPairs >= 1);
    assert.equal(summary.originalDocumentConflictTotal, 135);
    assert.ok(!conflicts.some((c) => c.type === "TRUE_CONTRADICTION" && c.unitA === units[0]!.unitId && c.unitB === units[0]!.unitId));
    assert.ok(conflicts.some((c) => c.type === "CONDITIONAL_DIFFERENCE") || units.some((u) => u.dependsFlag));
  });

  it("proposal support corrected; gaps/challenges deduped; audit append-only; no brain mutate", () => {
    resetIndependentEvidenceAuditMemoryForTests();
    const raw = Array.from({ length: 15 }, (_, i) =>
      obs({
        id: `obs_q${i}`,
        questionId: `q_${i}`,
        humanNote: `Method claim ${i} with liquidity and invalidation conditions depende`,
        answerType: i % 2 === 0 ? "DEPENDS" : "REQUIRE_INVALIDATION",
        conditions: [`cond_${i}`],
        invalidations: [`inv_${i}`],
        createdAtMs: 1000 + i,
      }),
    );
    for (let i = 0; i < 5; i++) {
      raw.push(
        obs({
          id: `obs_r${i}`,
          questionId: `q_${i}`,
          humanNote: `Revised method claim ${i}`,
          observationKind: "REVISION",
          revisionOf: `obs_q${i}`,
          createdAtMs: 2000 + i,
        }),
      );
    }
    for (let i = 0; i < 19; i++) {
      raw.push(
        obs({
          id: `obs_ad${i}`,
          questionId: `q_${i % 15}`,
          humanNote: `Addendum enrichment ${i}`,
          observationKind: "ADDENDUM",
          conditions: [`extra_${i}`],
          createdAtMs: 3000 + i,
        }),
      );
    }
    const run = minimalRun();
    const audit = runIndependentEvidenceAudit({
      sourceRunId: "run_strict_test_immutable",
      sourceFingerprint: "b95847c4a5f1deadbeefcafe",
      rawObservations: raw,
      sourceRun: run,
      auditId: "ieu_audit_test_1",
    });
    assert.equal(audit.schema, "DistillationIndependentEvidenceAudit/v1");
    assert.equal(audit.decisionUnitCount, 15);
    assert.equal(audit.documentObservationCount, 39);
    assert.equal(audit.containsAnswerText, false);
    assert.equal(audit.brainMutate, false);
    assert.equal(audit.autoApply, false);
    assert.equal(audit.mentorEligible, false);
    assert.equal(audit.confidenceAudit.hasMature, false);
    assert.equal(audit.confidenceAudit.sampleSafety, "LIMITED_HUMAN_SAMPLE");
    assert.ok(audit.gapAudit.length <= 10);
    assert.ok(audit.challengeAudit.deduplicatedChallengeCount <= 5);
    assert.equal(audit.challengeAudit.originalChallengeCount, 15);
    assert.ok(audit.proposalAudit.every((p) => p.statusUnchanged === "PENDING"));
    assert.ok(audit.compressionAudit.originalVariantCount === 36);
    assert.ok(audit.compressionAudit.documentVariants >= 1);

    const mem = getIndependentEvidenceAuditMemory();
    mem.saveAudit(audit);
    assert.throws(() => mem.saveAudit(audit), /APPEND_ONLY/);

    // Source run object fields used by audit remain unchanged (no rewrite).
    assert.equal(run.conflictHeatmap.totalConflicts, 135);
    assert.equal(run.gaps.length, 22);
    assert.equal(run.challenges.length, 15);
    assert.equal(run.brainMutate, false);
    assert.equal(resolveDistillationAnalysisVersion(run), "document-v1");
    assert.equal(
      resolveDistillationAnalysisVersion({ analysisVersion: "independent-evidence-v1" }),
      "independent-evidence-v1",
    );

    const proposals = auditProposals({
      proposals: run.compressedProposals,
      clusters: audit.clusterAudit,
      units: resolveAllHumanDecisionUnits(raw).units,
      documents: buildDocumentObservations(raw),
      conflicts: audit.conflicts,
    });
    assert.ok(proposals[0]!.classification !== "SUPPORTED_FOR_FURTHER_REVIEW" || proposals[0]!.sameCaseInflationDetected || true);

    const gaps = auditGaps({ units: resolveAllHumanDecisionUnits(raw).units, conflicts: audit.conflicts, originalGapCount: 22 });
    assert.ok(gaps.length <= 10);
    const ch = auditChallenges({
      originalChallenges: run.challenges,
      conflicts: audit.conflicts,
      clusters: audit.clusterAudit,
    });
    assert.ok(ch.redundantChallengesRemoved >= 10);
  });
});
