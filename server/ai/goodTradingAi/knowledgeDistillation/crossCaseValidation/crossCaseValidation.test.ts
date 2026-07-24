/**
 * AI-7.3.13 — Cross-case methodology validation round tests.
 */
import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import {
  CROSS_CASE_QUESTION_CAP,
  CROSS_CASE_VALIDATION_AUDIT_SCHEMA,
} from "@shared/goodTradingAiCrossCaseValidation";
import type { ChallengeItem } from "@shared/goodTradingAiKnowledgeDistillation";
import type { IndependentEvidenceAudit } from "@shared/goodTradingAiIndependentEvidence";
import type { ProposalSupportAudit } from "@shared/goodTradingAiIndependentEvidence";
import {
  generateCrossCaseQuestions,
  auditQuestionNeutrality,
  classifyHypothesisResults,
  correlatedSupportPenalty,
  reassessProposalsAfterCrossCase,
  buildCrossCaseValidationAudit,
  assertOriginalArtifactsIntact,
  startCrossCaseValidationSession,
  assertNoForbiddenBlindFields,
  getCrossCaseValidationAuditMemory,
  resetCrossCaseValidationAuditMemoryForTests,
  type UnitHypothesisLink,
} from "./index";
import { getCriticalCalibrationMemory } from "../../criticalCalibration/memoryStore";
import {
  getBlindPacket,
  revealAfterCalibrationSubmit,
} from "../../criticalCalibration/sessionService";

function fakeChallenges(): ChallengeItem[] {
  return [
    {
      id: "ch_015",
      kind: "FULL_INVALIDATION",
      prompt: "Challenge: State the full invalidation stack that would force you to abandon the frame.",
      relatedLenses: ["INVALIDATION"],
      hypothesisA: "Frame remains",
      hypothesisB: "Frame invalidated",
      discriminationScore: 0.75,
      neverAnswers: true,
      mentorEligible: false,
    },
    {
      id: "ch_001",
      kind: "HYPOTHESIS_DISCRIMINATION",
      prompt: "Challenge: Assume ACCEPTANCE-first OR LIQUIDITY-first — abandon one?",
      relatedLenses: ["ACCEPTANCE", "LIQUIDITY"],
      hypothesisA: "ACCEPTANCE dominates LIQUIDITY",
      hypothesisB: "LIQUIDITY dominates ACCEPTANCE",
      discriminationScore: 0.73,
      neverAnswers: true,
      mentorEligible: false,
    },
    {
      id: "ch_002",
      kind: "HYPOTHESIS_DISCRIMINATION",
      prompt: "Challenge: Assume ABSORPTION-first OR ACCEPTANCE-first — abandon one?",
      relatedLenses: ["ABSORPTION", "ACCEPTANCE"],
      hypothesisA: "ABSORPTION dominates ACCEPTANCE",
      hypothesisB: "ACCEPTANCE dominates ABSORPTION",
      discriminationScore: 0.72,
      neverAnswers: true,
      mentorEligible: false,
    },
    {
      id: "ch_003",
      kind: "HYPOTHESIS_DISCRIMINATION",
      prompt: "Challenge: Assume LIQUIDITY-first OR REJECTION-first — abandon one?",
      relatedLenses: ["LIQUIDITY", "REJECTION"],
      hypothesisA: "LIQUIDITY dominates REJECTION",
      hypothesisB: "REJECTION dominates LIQUIDITY",
      discriminationScore: 0.72,
      neverAnswers: true,
      mentorEligible: false,
    },
    {
      id: "ch_004",
      kind: "HYPOTHESIS_DISCRIMINATION",
      prompt: "Challenge: Assume ACCEPTANCE-first OR REJECTION-first — abandon one?",
      relatedLenses: ["ACCEPTANCE", "REJECTION"],
      hypothesisA: "ACCEPTANCE dominates REJECTION",
      hypothesisB: "REJECTION dominates ACCEPTANCE",
      discriminationScore: 0.72,
      neverAnswers: true,
      mentorEligible: false,
    },
  ];
}

function fakeAudit(): IndependentEvidenceAudit {
  return {
    schema: "DistillationIndependentEvidenceAudit/v1",
    id: "ieu_audit_test_cc13",
    sourceRunId: "run_strict_test",
    sourceFingerprint: "b95847c4a5f1deadbeef",
    documentObservationCount: 39,
    decisionUnitCount: 15,
    independentSupportMetrics: {
      independentCaseCount: 15,
      crossCaseRepeatedPatterns: 0,
      withinCaseEnrichments: 15,
      weightedIndependentSupport: 15,
      singleCaseObservations: 0,
      insufficientIndependentSupport: 0,
    },
    clusterAudit: [],
    conflictAudit: {
      rawCandidatePairs: 144,
      excludedSameUnitPairs: 39,
      excludedRevisionPairs: 5,
      conditionalRelations: 77,
      trueContradictions: 0,
      finalConflictCount: 77,
      originalDocumentConflictTotal: 135,
      originalConflictFormula:
        "sum over conflictish documents of C(lensCount,2) co-occurrence increments",
      mentorEligible: false,
    },
    conflicts: [],
    proposalAudit: [],
    gapAudit: [],
    challengeAudit: {
      originalChallengeCount: 15,
      deduplicatedChallengeCount: 5,
      highInformationChallenges: 5,
      redundantChallengesRemoved: 10,
      challengeIds: ["ch_015", "ch_001", "ch_002", "ch_003", "ch_004"],
    },
    confidenceAudit: {
      sampleSafety: "LIMITED_HUMAN_SAMPLE",
      hasMature: false,
      clusterCount: 0,
      avgScore: 0,
      maxScore: 0,
      minScore: 0,
      scores: [],
    },
    compressionAudit: {
      documentVariants: 0,
      crossCaseVariants: 0,
      sameCaseRedundancies: 0,
      crossCaseRedundancies: 0,
      trueEquivalentClaims: 0,
      conditionalVariants: 77,
    },
    utilityReassessment: {
      auditedClass: "DISTILLATION_PARTIALLY_USEFUL",
      reason: "Limited independent support",
      crossCaseRepeatedPatterns: 0,
      independentSupport: 15,
      trueContradictions: 0,
      usefulGaps: 1,
      nonredundantProposals: 0,
      discriminativeChallenges: 5,
      sampleSafety: "LIMITED_HUMAN_SAMPLE",
      hasMature: false,
      mentorEligible: false,
    },
    warnings: [],
    createdAtMs: Date.now(),
    brainMutate: false,
    autoApply: false,
    mentorEligible: false,
    containsAnswerText: false,
  };
}

describe("AI-7.3.13 cross-case validation", () => {
  beforeEach(() => {
    resetCrossCaseValidationAuditMemoryForTests();
  });

  it("challenge→distinct scenario generation (cap 5, all DISTINCT, BLIND_SAFE)", () => {
    const audit = fakeAudit();
    const out = generateCrossCaseQuestions({
      audit,
      challenges: fakeChallenges(),
      priorPrompts: ["Si absorption y delta divergen, bajo que condiciones absorption pesa mas?"],
    });
    assert.equal(out.drafts.length, CROSS_CASE_QUESTION_CAP);
    assert.equal(out.calibrationQuestions.length, 5);
    assert.ok(out.drafts.every((d) => d.relationToOriginal === "DISTINCT"));
    assert.ok(out.drafts.every((d) => d.neutralityClass === "BLIND_SAFE"));
    assert.ok(out.drafts.every((d) => d.sourceAuditId === audit.id));
    assert.equal(new Set(out.hypotheses.map((h) => h.kind)).size, 5);
  });

  it("rejects leading / duplicate wording", () => {
    const leading = auditQuestionNeutrality({
      prompt: "¿Confirmás que la absorción solo vale con aceptación?",
      priorPrompts: [],
      challengePrompt: "",
      relationToOriginal: "DISTINCT",
    });
    assert.equal(leading.class, "POTENTIALLY_LEADING");

    const dup = auditQuestionNeutrality({
      prompt: "Si absorption y delta divergen, bajo que condiciones absorption pesa mas? (permitido: depende)",
      priorPrompts: [
        "Si absorption y delta divergen, bajo que condiciones absorption pesa mas? (permitido: depende)",
      ],
      challengePrompt: "",
      relationToOriginal: "DISTINCT",
    });
    assert.equal(dup.class, "DUPLICATE_SCENARIO");
  });

  it("previous answer / hypothesis hidden from blind packet", () => {
    const started = startCrossCaseValidationSession({
      audit: fakeAudit(),
      challenges: fakeChallenges(),
      sourceRunId: "run_strict_test",
    });
    assert.equal(started.questionCount, 5);
    assert.equal(started.answeredCount, 0);
    assert.equal(started.session.sourceAuditId, "ieu_audit_test_cc13");
    const packet = getBlindPacket(started.session.id, started.session.questionIds[0]!);
    assertNoForbiddenBlindFields(packet as unknown as Record<string, unknown>);
    assert.equal("targetHypothesisId" in packet, false);
    assert.equal("engineOutcome" in packet, false);
    assert.throws(
      () => revealAfterCalibrationSubmit(started.session.id, started.session.questionIds[0]!),
      /ANSWER_REQUIRED_BEFORE_REVEAL/,
    );
  });

  it("two distinct cases required for CROSS_CASE_SUPPORTED; correlated penalized", () => {
    assert.equal(correlatedSupportPenalty("RELATED"), 0.55);
    assert.equal(correlatedSupportPenalty("METAMORPHIC_VARIANT"), 0.25);
    assert.equal(correlatedSupportPenalty("DUPLICATE"), 0);

    const audit = fakeAudit();
    const { hypotheses } = generateCrossCaseQuestions({
      audit,
      challenges: fakeChallenges(),
    });
    const hyp = hypotheses[0]!;
    const one: UnitHypothesisLink[] = [
      {
        unitId: "u1",
        hypothesisId: hyp.id,
        relationToOriginal: "DISTINCT",
        supports: true,
        withConditions: false,
        counterexample: false,
        contradicts: false,
      },
    ];
    const r1 = classifyHypothesisResults({
      hypotheses: [hyp],
      links: one,
      decisionUnits: [{ unitId: "u1", independentSupportWeight: 1 }],
    });
    assert.equal(r1[0]!.classification, "SCENARIO_SPECIFIC");

    const two: UnitHypothesisLink[] = [
      ...one,
      {
        unitId: "u2",
        hypothesisId: hyp.id,
        relationToOriginal: "DISTINCT",
        supports: true,
        withConditions: false,
        counterexample: false,
        contradicts: false,
      },
    ];
    const r2 = classifyHypothesisResults({
      hypotheses: [hyp],
      links: two,
      decisionUnits: [
        { unitId: "u1", independentSupportWeight: 1 },
        { unitId: "u2", independentSupportWeight: 1 },
      ],
    });
    assert.equal(r2[0]!.classification, "CROSS_CASE_SUPPORTED");

    const counter = classifyHypothesisResults({
      hypotheses: [hyp],
      links: [
        {
          unitId: "u3",
          hypothesisId: hyp.id,
          relationToOriginal: "DISTINCT",
          supports: false,
          withConditions: false,
          counterexample: true,
          contradicts: false,
        },
      ],
      decisionUnits: [{ unitId: "u3", independentSupportWeight: 1 }],
    });
    assert.equal(counter[0]!.classification, "COUNTEREXAMPLE_FOUND");
  });

  it("proposal reassessment keeps PENDING; READY needs ≥2 distinct + conditions + invalidation", () => {
    const prior: ProposalSupportAudit[] = [
      {
        proposalId: "kd_p_001",
        documentSupportCount: 11,
        decisionUnitSupportCount: 6,
        independentCaseSupportCount: 1,
        correlatedCaseSupportCount: 0,
        contradictionCount: 0,
        sameCaseInflationDetected: true,
        impact: "MEDIUM",
        risk: "MEDIUM",
        remainsValidAfterAudit: false,
        classification: "OVERSTATED_BY_DOCUMENT_COUNT",
        statusUnchanged: "PENDING",
        mentorEligible: false,
      },
    ];
    const needs = reassessProposalsAfterCrossCase({
      priorProposalAudits: prior,
      distinctScenarioByProposal: { kd_p_001: 1 },
    });
    assert.equal(needs[0]!.afterClass, "NEEDS_MORE_CASES");
    assert.equal(needs[0]!.statusUnchanged, "PENDING");

    const ready = reassessProposalsAfterCrossCase({
      priorProposalAudits: prior,
      distinctScenarioByProposal: { kd_p_001: 2 },
      conditionsPreservedByProposal: { kd_p_001: true },
      invalidationDefinedByProposal: { kd_p_001: true },
    });
    assert.equal(ready[0]!.afterClass, "READY_FOR_METHODOLOGY_REVIEW");
    assert.equal(ready[0]!.statusUnchanged, "PENDING");
  });

  it("audit append-only; original run/audit immutable; no Brain mutation; no answer text", () => {
    const audit = buildCrossCaseValidationAudit({
      id: "ccv_audit_test_1",
      sourceRunId: "run_strict_test",
      sourceIndependentAuditId: "ieu_audit_test_cc13",
      sourceSessionIds: ["sess_a", "sess_b"],
      decisionUnitCount: 20,
      documentObservationCount: 44,
      distinctScenarioCount: 5,
      relatedScenarioCount: 0,
      crossCaseRepeatedPatterns: 0,
      conditionalVariants: 77,
      trueContradictions: 0,
      hypotheses: generateCrossCaseQuestions({
        audit: fakeAudit(),
        challenges: fakeChallenges(),
      }).hypotheses,
      hypothesisResults: [],
      proposalReassessment: [],
      challenges: ["ch_015", "ch_001", "ch_002", "ch_003", "ch_004"],
    });
    assert.equal(audit.schema, CROSS_CASE_VALIDATION_AUDIT_SCHEMA);
    assert.equal(audit.containsAnswerText, false);
    assert.equal(audit.brainMutate, false);
    assert.equal(audit.mentorEligible, false);
    getCrossCaseValidationAuditMemory().saveAudit(audit);
    assert.throws(
      () => getCrossCaseValidationAuditMemory().saveAudit(audit),
      /AUDIT_APPEND_ONLY_REFUSES_OVERWRITE/,
    );
    assert.throws(
      () =>
        assertOriginalArtifactsIntact({
          sourceRunFingerprintBefore: "b95847c4a5f1",
          sourceRunFingerprintAfter: "CHANGED",
          sourceAudit: fakeAudit(),
        }),
      /ORIGINAL_RUN_MUTATED/,
    );
    assertOriginalArtifactsIntact({
      sourceRunFingerprintBefore: "b95847c4a5f1",
      sourceRunFingerprintAfter: "b95847c4a5f1",
      sourceAudit: fakeAudit(),
    });
  });

  it("durable session flags and five-question cap", () => {
    const started = startCrossCaseValidationSession({
      audit: fakeAudit(),
      challenges: fakeChallenges(),
      sourceRunId: "run_strict_test",
      repositoryDurable: true,
    });
    assert.equal(started.session.kind, "HUMAN");
    assert.equal(started.session.questionIds.length, 5);
    assert.equal(started.session.roundKind, "CROSS_CASE_VALIDATION");
    assert.equal(started.session.excludeTechnical, true);
    assert.equal(started.session.excludeHoldout, true);
    assert.equal(started.session.realMarketData, false);
    assert.equal(started.session.autoReveal, false);
    assert.equal(started.session.autoApply, false);
    assert.equal(started.session.brainMutate, false);
    assert.equal(started.session.mentorEligible, false);
    assert.equal(started.session.repositoryDurable, true);
    const mem = getCriticalCalibrationMemory();
    assert.ok(mem.getSession(started.session.id));
  });
});
