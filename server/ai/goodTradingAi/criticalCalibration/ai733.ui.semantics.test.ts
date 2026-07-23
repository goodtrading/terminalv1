import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, beforeEach } from "node:test";
import { resetCriticalCalibrationMemoryForTests, getCriticalCalibrationMemory } from "./memoryStore";
import {
  archiveTechnicalSession,
  assertBlindPacketSafe,
  getSessionProgress,
  listSessionSummaries,
  revealAfterCalibrationSubmit,
  resumeCriticalCalibrationSession,
  startCriticalCalibrationSession,
  submitCalibrationAnswer,
  summarizeQueue,
  buildActiveLearningQueue,
} from "./sessionService";

describe("AI-7.3.3 session UI semantics", () => {
  beforeEach(() => {
    const dir = mkdtempSync(join(tmpdir(), "cc-ui-"));
    resetCriticalCalibrationMemoryForTests(dir);
  });

  it("blind start hides engine and reveal-before-answer rejects", () => {
    const started = startCriticalCalibrationSession({ seed: "73001", initialQuestionCount: 15, kind: "TECHNICAL", label: "tech" });
    assert.equal(started.blindQuestions.length, 15);
    for (const q of started.blindQuestions) {
      assertBlindPacketSafe(q);
      assert.equal(q.mentorEligible, false);
      assert.ok(!("engineOutcome" in q));
      assert.ok(!("proposalCandidate" in q));
    }
    const qid = started.blindQuestions[0]!.questionId;
    assert.throws(() => revealAfterCalibrationSubmit(started.session.id, qid), /ANSWER_REQUIRED_BEFORE_REVEAL/);
  });

  it("append-only answers + reveal marks progress; archive technical only", () => {
    const started = startCriticalCalibrationSession({ seed: "ui733", initialQuestionCount: 5, kind: "TECHNICAL" });
    const qid = started.blindQuestions[0]!.questionId;
    const a1 = submitCalibrationAnswer({
      sessionId: started.session.id,
      questionId: qid,
      answerText: "Require confirmation of absorption before priority",
      answerType: "REQUIRE_CONFIRMATION",
      conditions: ["delta confirms"],
      minimumConfirmations: ["absorption hold"],
      invalidations: ["spoof clears"],
      confidence: "HIGH",
    });
    const a2 = submitCalibrationAnswer({
      sessionId: started.session.id,
      questionId: qid,
      answerText: "Revision with more conditions",
      answerType: "DEPENDS",
      confidence: "MEDIUM",
    });
    assert.notEqual(a1.id, a2.id);
    assert.equal(a2.observationKind, "REVISION");
    assert.equal(a2.revisionOf, a1.id);
    const store = getCriticalCalibrationMemory();
    assert.equal(store.listObservations(started.session.id).filter((o) => o.questionId === qid).length, 2);

    const revealed = revealAfterCalibrationSubmit(started.session.id, qid);
    assert.equal(revealed.proposalSchemaWarning, "PROPOSAL_SCHEMA_NOT_READY_FOR_BRAIN_APPLICATION");
    assert.equal(revealed.brainMutated, false);
    assert.equal(revealed.mentorEligible, false);
    const progress = getSessionProgress(started.session.id);
    assert.ok(progress.answeredCount >= 1);
    assert.ok(progress.revealedCount >= 1);

    const resumed = resumeCriticalCalibrationSession(started.session.id);
    assert.equal(resumed.questionCount, 5);
    assert.equal(resumed.brainMutate, false);

    const archived = archiveTechnicalSession(started.session.id);
    assert.equal(archived.archived, true);
    assert.equal(archived.status, "ARCHIVED");

    const human = startCriticalCalibrationSession({ seed: "ui733h", initialQuestionCount: 3, kind: "HUMAN" });
    assert.throws(() => archiveTechnicalSession(human.session.id), /ONLY_TECHNICAL/);
    assert.ok(listSessionSummaries().length >= 2);
  });

  it("queue summary has aggregates without dumping individual bias scores to caller shape", () => {
    const queue = buildActiveLearningQueue({ seed: "73001", scenarioCount: 40 });
    const summary = summarizeQueue(queue.questions);
    assert.ok(summary.count >= 15);
    assert.ok(Object.keys(summary.typeDistribution).length >= 1);
    assert.equal(summary.mentorEligible, false);
  });
});