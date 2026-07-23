import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  ALLOWED_BLIND_KEYS,
  assertClientBlindPacketSafe,
  canReveal,
  isLocalStorageAnswerAuthority,
  NOT_SAFE_FOR_BRAIN_APPLICATION,
  PROPOSAL_SCHEMA_WARNING,
  redactSessionId,
  SAFE_FOR_CALIBRATION_SESSION,
} from "./blindGuards";

describe("AI-7.3.3 critical calibration UI source & guards", () => {
  it("API layer uses credentials:include and never prefetches reveal in helpers", () => {
    const api = readFileSync(join(process.cwd(), "client/src/lib/criticalCalibration/criticalCalibrationApi.ts"), "utf8");
    assert.ok(api.includes('credentials: "include"'));
    assert.ok(api.includes("revealAfterSubmit"));
    assert.ok(api.includes("Only call after a successful submit"));
    assert.ok(!/localStorage\.setItem/.test(api));
    assert.ok(!/Authorization/.test(api));
    assert.ok(api.includes("/sessions/start"));
    assert.ok(api.includes("/batch/generate"));
    assert.ok(api.includes("/questions/active-learning"));
  });

  it("lab page wires modes and no Brain apply button", () => {
    const page = readFileSync(join(process.cwd(), "client/src/pages/admin/CriticalCalibrationLabPage.tsx"), "utf8");
    assert.ok(page.includes("Blind Session"));
    assert.ok(page.includes("Reveal (after submit)"));
    assert.ok(page.includes("canReveal"));
    assert.ok(page.includes("PROPOSAL_SCHEMA_WARNING") || page.includes("PROPOSAL_SCHEMA_NOT_READY_FOR_BRAIN_APPLICATION"));
    assert.ok(page.includes("No Approve-to-Brain") || page.includes("no Brain apply"));
    assert.ok(!/applyToBrain|brainMutate:\s*true/.test(page));
    assert.ok(!/<button[^>]*>\s*Approve/.test(page));
    assert.ok(page.includes("credentials") || page.includes("criticalCalibrationApi"));
    assert.ok(page.includes("answerType"));
    assert.ok(page.includes("DEPENDS"));
  });

  it("blind guards reject engine/proposal leakage", () => {
    assert.throws(() => assertClientBlindPacketSafe({ sessionId: "s", questionId: "q", prompt: "p", engineOutcome: "X" }));
    assert.doesNotThrow(() =>
      assertClientBlindPacketSafe({
        sessionId: "s",
        questionId: "q",
        prompt: "What confirms absorption?",
        questionType: "CONFIRMATION_REQUIREMENT",
        relatedLenses: ["ABSORPTION"],
        allowsDepends: true,
        confidenceOptions: ["LOW", "MEDIUM", "HIGH"],
        mentorEligible: false,
      }),
    );
    assert.equal(canReveal(false), false);
    assert.equal(canReveal(true), true);
    assert.equal(isLocalStorageAnswerAuthority(), false);
    assert.equal(redactSessionId("9dc3d338-ffff-aaaa-bbbb-cccccccccccc"), "9dc3d338…");
    assert.ok(ALLOWED_BLIND_KEYS.includes("prompt"));
    assert.equal(PROPOSAL_SCHEMA_WARNING, "PROPOSAL_SCHEMA_NOT_READY_FOR_BRAIN_APPLICATION");
    assert.equal(SAFE_FOR_CALIBRATION_SESSION, "SAFE_FOR_CALIBRATION_SESSION");
    assert.equal(NOT_SAFE_FOR_BRAIN_APPLICATION, "NOT_SAFE_FOR_BRAIN_APPLICATION");
  });
});