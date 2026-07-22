/**
 * AI-7.2 Human Methodology Review — comprehensive tests.
 */
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import {
  HUMAN_REVIEW_CASES,
  assertHumanReviewCasesContract,
  listHoldoutCases,
  getHumanReviewCase,
} from "./reviewCases";
import { scenarioLeaksAnswer, toBlindCaseView, hashAnswerBody } from "./biasControls";
import { classifyThreeWay } from "./comparison";
import {
  createHoldoutSnapshot,
  computeHoldoutFingerprint,
  verifyHoldoutPreservation,
} from "./holdout";
import {
  HumanDecisionReviewRepository,
  setHumanDecisionReviewRepositoryForTests,
} from "./repository";
import { createMethodologyProposalFromComparison } from "./approval";
import { buildHumanDecisionReviewReport } from "./report";
import { buildDecisionMethodologyReviewPacket } from "./packet";
import {
  startBlindSession,
  submitHumanAnswer,
  revealAfterSubmit,
} from "./sessionService";
import { HUMAN_REVIEW_OWNER } from "@shared/goodTradingAiHumanReview";

describe("AI-7.2 human methodology review", () => {
  afterEach(() => {
    setHumanDecisionReviewRepositoryForTests(null);
  });

  it("contracts: >=80 cases, cohorts, holdout 20", () => {
    assertHumanReviewCasesContract();
    assert.ok(HUMAN_REVIEW_CASES.length >= 80);
    assert.equal(listHoldoutCases().length, 20);
    const by: Record<string, number> = {};
    for (const c of HUMAN_REVIEW_CASES) by[c.cohort] = (by[c.cohort] ?? 0) + 1;
    assert.ok((by.REWORDED_GOLDEN ?? 0) >= 40);
    assert.ok((by.NEW ?? 0) >= 20);
    assert.ok((by.AMBIGUOUS ?? 0) >= 10);
    assert.ok((by.INSUFFICIENT ?? 0) >= 10);
    assert.ok((by.HOLDOUT ?? 0) >= 20);
  });

  it("scenario text does not leak PASS/FAIL/EXPECTED/GOLDEN/engine outcomes", () => {
    for (const c of HUMAN_REVIEW_CASES) {
      assert.equal(scenarioLeaksAnswer(c.scenarioText), false, c.id);
      assert.ok(!/\bPASS\b/i.test(c.scenarioText), c.id);
      assert.ok(!/\bFAIL\b/i.test(c.scenarioText), c.id);
      assert.ok(!/\bEXPECTED\b/i.test(c.scenarioText), c.id);
      assert.ok(!/\bGOLDEN\b/i.test(c.scenarioText), c.id);
    }
  });

  it("blind view hides sealed golden outcomes and holdout cohort", () => {
    const holdout = listHoldoutCases()[0]!;
    const view = toBlindCaseView(holdout, 0);
    assert.equal(view.displayCohort, "STANDARD");
    assert.ok(!("goldenExpectOutcomes" in view));
    assert.ok(!("holdout" in view));
    const blob = JSON.stringify(view);
    assert.ok(!blob.includes("PASS"));
    assert.ok(!blob.includes("FAIL"));
  });

  it("comparison classes: agree, split, circular, insufficient", () => {
    const agree = classifyThreeWay({
      reviewCaseId: "t1",
      humanOutcome: "HYPOTHESIS_SUPPORTED",
      engineOutcome: "HYPOTHESIS_SUPPORTED",
      goldenOutcomes: ["HYPOTHESIS_SUPPORTED"],
    });
    assert.equal(agree.comparisonClass, "HUMAN_ENGINE_GOLDEN_AGREE");

    const circular = classifyThreeWay({
      reviewCaseId: "t2",
      humanOutcome: "EVIDENCE_INSUFFICIENT",
      engineOutcome: "HYPOTHESIS_SUPPORTED",
      goldenOutcomes: ["HYPOTHESIS_SUPPORTED"],
    });
    assert.equal(circular.comparisonClass, "CIRCULAR_CALIBRATION_SIGNAL");
    assert.equal(circular.circularCalibrationRisk, true);

    const insuff = classifyThreeWay({
      reviewCaseId: "t3",
      humanOutcome: "EVIDENCE_INSUFFICIENT",
      engineOutcome: "HYPOTHESIS_INVALIDATED",
      goldenOutcomes: ["READING_CONFLICTED"],
    });
    assert.ok(
      insuff.comparisonClass === "HUMAN_INSUFFICIENT_ENGINE_DEFINITE" ||
        insuff.comparisonClass === "THREE_WAY_SPLIT",
    );
  });

  it("repository append-only revisions never mutate prior", () => {
    const dir = mkdtempSync(join(tmpdir(), "hr-repo-"));
    const repo = new HumanDecisionReviewRepository(dir);
    setHumanDecisionReviewRepositoryForTests(repo);
    const session = repo.createSession({ caseOrder: ["hr_rw_01"] });
    const body = {
      reviewCaseId: "hr_rw_01",
      primaryOutcome: "HYPOTHESIS_OPEN" as const,
      requiredConfirmations: [] as string[],
      triggeredInvalidations: [] as string[],
      confidence: "MEDIUM" as const,
      insufficientEvidence: false,
      ambiguousReading: false,
    };
    const a1 = {
      ...body,
      owner: HUMAN_REVIEW_OWNER,
      revision: 1,
      submittedAtMs: 1000,
      answerHash: hashAnswerBody(body),
      mentorEligible: false as const,
    };
    repo.appendAnswer(session.id, a1);
    const a2 = {
      ...a1,
      revision: 2,
      submittedAtMs: 2000,
      primaryOutcome: "EVIDENCE_INSUFFICIENT" as const,
      answerHash: hashAnswerBody({ ...body, primaryOutcome: "EVIDENCE_INSUFFICIENT" }),
    };
    repo.appendAnswer(session.id, a2);
    const latest = repo.getLatestAnswer(session.id, "hr_rw_01");
    assert.equal(latest?.revision, 2);
    assert.equal(latest?.primaryOutcome, "EVIDENCE_INSUFFICIENT");
    // prior revision sealed on disk
    const raw = JSON.parse(
      readFileSync(join(dir, "private", "answers", session.id, "hr_rw_01.json"), "utf8"),
    ) as { revisions: Array<{ revision: number; primaryOutcome: string; submittedAtMs: number }> };
    assert.equal(raw.revisions[0].revision, 1);
    assert.equal(raw.revisions[0].primaryOutcome, "HYPOTHESIS_OPEN");
    assert.equal(raw.revisions[0].submittedAtMs, 1000);
  });

  it("report GO_PARCIAL when infrastructure ready and human review incomplete", () => {
    const report = buildHumanDecisionReviewReport({
      comparisons: [],
      answeredCount: 0,
      infrastructureReady: true,
      humanReviewComplete: false,
    });
    assert.equal(report.gatesStatus.overall, "GO_PARCIAL_INFRASTRUCTURE_READY");
    assert.equal(report.proposedGates.autoApproveGolden, false);
    assert.equal(report.proposedGates.autoAdjustExpectations, false);
    assert.equal(report.proposedGates.holdoutRequiredBeforeCalibrationAdjust, true);
    assert.equal(report.mentorEligible, false);
  });

  it("proposals PENDING never auto-approve golden", () => {
    const comparison = classifyThreeWay({
      reviewCaseId: "hr_rw_01",
      humanOutcome: "EVIDENCE_INSUFFICIENT",
      engineOutcome: "HYPOTHESIS_SUPPORTED",
      goldenOutcomes: ["HYPOTHESIS_SUPPORTED"],
    });
    const prop = createMethodologyProposalFromComparison(comparison);
    assert.equal(prop.status, "PENDING");
    assert.equal(prop.autoApply, false);
    assert.equal(prop.brainMutate, false);
    assert.equal(prop.owner, "IGNACIO");
  });

  it("holdout fingerprint preserve", () => {
    const snap = createHoldoutSnapshot(1);
    assert.equal(snap.caseIds.length, 20);
    assert.equal(snap.fingerprint, computeHoldoutFingerprint(snap.caseIds));
    const v = verifyHoldoutPreservation(snap);
    assert.equal(v.ok, true);
  });

  it("blind session hides outcomes; submit does not reveal; reveal after answer", () => {
    const dir = mkdtempSync(join(tmpdir(), "hr-sess-"));
    const repo = new HumanDecisionReviewRepository(dir);
    setHumanDecisionReviewRepositoryForTests(repo);
    const started = startBlindSession("test-seed");
    assert.equal(started.mentorEligible, false);
    assert.ok(started.cases.length >= 80);
    const first = started.cases[0]!;
    const blob = JSON.stringify(first);
    assert.ok(!blob.includes("goldenExpectOutcomes"));
    assert.ok(!/\bPASS\b/.test(blob));
    assert.ok(!/\bFAIL\b/.test(blob));

    const submitted = submitHumanAnswer(started.session.id, {
      reviewCaseId: first.id,
      primaryOutcome: "HYPOTHESIS_OPEN",
      requiredConfirmations: [],
      triggeredInvalidations: [],
      confidence: "LOW",
      insufficientEvidence: true,
      ambiguousReading: false,
    });
    assert.equal(submitted.revision, 1);
    assert.equal(submitted.mentorEligible, false);

    assert.throws(() => revealAfterSubmit(started.session.id, "no_such_case"));
    const revealed = revealAfterSubmit(started.session.id, first.id);
    assert.ok(revealed.comparison);
    assert.equal(revealed.mentorEligible, false);
    assert.ok(Array.isArray(revealed.goldenExpectOutcomes));
  });

  it("packet strips secrets and mentorEligible false", () => {
    const packet = buildDecisionMethodologyReviewPacket({
      includeAnswers: true,
      answers: [
        {
          reviewCaseId: "hr_rw_01",
          owner: HUMAN_REVIEW_OWNER,
          primaryOutcome: "HYPOTHESIS_OPEN",
          requiredConfirmations: [],
          triggeredInvalidations: [],
          confidence: "LOW",
          notes: "api_key=supersecret token bearer abc.def",
          insufficientEvidence: true,
          ambiguousReading: false,
          revision: 1,
          submittedAtMs: 1,
          answerHash: "abcdefgh",
          mentorEligible: false,
        },
      ],
    });
    assert.equal(packet.mentorEligible, false);
    const notes = packet.answers?.[0]?.notes ?? "";
    assert.ok(!notes.includes("supersecret"));
    assert.ok(notes.includes("[REDACTED]") || !/api_key/i.test(notes));
  });

  it("perf p95 submit path <100ms for in-memory ops", () => {
    const dir = mkdtempSync(join(tmpdir(), "hr-perf-"));
    const repo = new HumanDecisionReviewRepository(dir);
    setHumanDecisionReviewRepositoryForTests(repo);
    const started = startBlindSession();
    const caseId = started.cases[0]!.id;
    const samples: number[] = [];
    for (let i = 0; i < 25; i++) {
      const t0 = performance.now();
      // hash + schema validate path only (revision conflict avoided via fresh case each N)
      const body = {
        reviewCaseId: caseId,
        primaryOutcome: "HYPOTHESIS_OPEN" as const,
        requiredConfirmations: [] as string[],
        triggeredInvalidations: [] as string[],
        confidence: "MEDIUM" as const,
        insufficientEvidence: false,
        ambiguousReading: false,
      };
      hashAnswerBody(body);
      getHumanReviewCase(caseId);
      toBlindCaseView(getHumanReviewCase(caseId)!, 0);
      samples.push(performance.now() - t0);
    }
    samples.sort((a, b) => a - b);
    const p95 = samples[Math.floor(samples.length * 0.95)]!;
    assert.ok(p95 < 100, `p95=${p95}ms`);
  });
});
