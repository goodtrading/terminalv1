import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MENTOR_EVAL_CASES } from "./mentorCases.ts";
import { runMentorEvals } from "./runMentorEvals.ts";

describe("mentor eval suite AI-2", () => {
  it("has at least 25 cases", () => {
    assert.ok(MENTOR_EVAL_CASES.length >= 25, `cases=${MENTOR_EVAL_CASES.length}`);
  });

  it("all eval cases pass", () => {
    const report = runMentorEvals();
    assert.equal(
      report.failed.length,
      0,
      report.failed.map((f) => `${f.caseId}: ${f.reason}`).join("\n"),
    );
    assert.equal(report.passed, report.total);
  });
});
