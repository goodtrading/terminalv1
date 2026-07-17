import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  CALIBRATION_CASES,
  calibrationCaseDistribution,
  getCalibrationCaseById,
} from "./cases.ts";
import { buildCurrentAiResponseForCase } from "./responseSnapshot.ts";
import { createOrUpdateReview } from "./reviews.ts";
import { resetCalibrationStoreForTests, listProposals, getProposal, upsertProposal } from "./store.ts";
import { applyProposalOffline } from "./applyCli.ts";
import { listApprovedGoldenCases, tryCreateGoldenFromReview } from "./golden.ts";
import { computeCalibrationMetrics } from "./metrics.ts";
import { sanitizeEditorialText } from "./sanitize.ts";
import { ensureKnowledgeRegistryValid } from "../knowledge/registry.ts";
import { isGoodTradingAiCalibrationEnabled } from "./features.ts";

afterEach(() => {
  resetCalibrationStoreForTests();
  delete process.env.GOODTRADING_AI_CALIBRATION_ENABLED;
});

describe("calibration AI-2.1", () => {
  ensureKnowledgeRegistryValid();

  it("has 40–60+ cases with required domain mins", () => {
    assert.ok(CALIBRATION_CASES.length >= 40, `count=${CALIBRATION_CASES.length}`);
    const d = calibrationCaseDistribution();
    assert.ok(d.constitution >= 5);
    assert.ok(d.liquidity >= 10);
    assert.ok(d.order_flow >= 10);
    assert.ok(d.gamma >= 8);
    assert.ok(d.delta_cvd_oi >= 8);
    assert.ok(d.execution_risk >= 8);
    assert.ok(d.compound_setup >= 8);
    const ids = new Set(CALIBRATION_CASES.map((c) => c.id));
    assert.equal(ids.size, CALIBRATION_CASES.length);
  });

  it("flag defaults off", () => {
    delete process.env.GOODTRADING_AI_CALIBRATION_ENABLED;
    assert.equal(isGoodTradingAiCalibrationEnabled(), false);
  });

  it("builds deterministic AI snapshot", () => {
    const c = getCalibrationCaseById("cal_liq_01")!;
    const a = buildCurrentAiResponseForCase(c);
    const b = buildCurrentAiResponseForCase(c);
    assert.equal(a.summary, b.summary);
    assert.deepEqual(
      a.knowledgeReferences.map((r) => r.id),
      b.knowledgeReferences.map((r) => r.id),
    );
    assert.ok(a.registryVersion.startsWith("kr-"));
  });

  it("review does not invent golden and can create proposals", () => {
    assert.equal(listApprovedGoldenCases().length, 0);
    const review = createOrUpdateReview({
      input: {
        caseId: "cal_liq_01",
        decision: "APPROVED_WITH_CHANGES",
        ignacioAnswer: "Wall no confirma reversión; pedir persistencia.",
        corrections: "Enfatizar prohibitedInterpretations wall=reversión",
        missingContext: "",
        notes: "",
      },
      userId: 42,
      userEmail: "admin@test.com",
    });
    assert.equal(review.reviewedByUserId, 42);
    assert.ok((review.proposalIds?.length ?? 0) >= 1);
    assert.equal(listApprovedGoldenCases().length, 0);
    const props = listProposals().filter((p) => p.reviewId === review.id);
    assert.ok(props.every((p) => p.associatedEvalIds.length >= 1));
    assert.ok(props.every((p) => p.status === "PENDING"));
  });

  it("APPROVED can create golden explicitly", () => {
    const review = createOrUpdateReview({
      input: {
        caseId: "cal_const_01",
        decision: "APPROVED",
        ignacioAnswer: "Contexto antes que señal.\nInvalidación obligatoria.",
        corrections: "",
        missingContext: "",
        notes: "",
      },
      userId: 1,
    });
    const g = tryCreateGoldenFromReview(review);
    assert.ok(g);
    assert.equal(listApprovedGoldenCases().length, 1);
  });

  it("apply CLI dry-runs and does not mutate registry count", () => {
    const before = ensureKnowledgeRegistryValid().entryCount;
    const review = createOrUpdateReview({
      input: {
        caseId: "cal_of_01",
        decision: "APPROVED_WITH_CHANGES",
        ignacioAnswer: "Absorption es hipótesis.",
        corrections: "Aclarar no-print-único",
        missingContext: "",
        notes: "",
      },
      userId: 1,
    });
    const propId = review.proposalIds![0]!;
    upsertProposal({ ...getProposal(propId)!, status: "APPROVED" });
    const result = applyProposalOffline({ proposalId: propId, dryRun: true });
    assert.equal(result.dryRun, true);
    assert.ok(result.patchPath);
    assert.equal(ensureKnowledgeRegistryValid().entryCount, before);
  });

  it("sanitize strips html and path traversal", () => {
    const s = sanitizeEditorialText('<script>alert(1)</script>../../etc/passwd hola', 1000);
    assert.ok(!s.includes("<script>"));
    assert.ok(!s.includes("../"));
  });

  it("metrics shape", () => {
    const m = computeCalibrationMetrics();
    assert.ok(m.totalCases >= 40);
    assert.equal(typeof m.pendingProposals, "number");
    assert.ok(m.generatedAt);
  });
});
