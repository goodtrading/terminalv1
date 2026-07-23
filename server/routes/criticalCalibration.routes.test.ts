import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

describe("AI-7.3 critical calibration routes source", () => {
  it("flag defaults false via features/runtimeEnv", () => {
    const features = readFileSync(join(process.cwd(), "server/ai/goodTradingAi/criticalCalibration/features.ts"), "utf8");
    const runtime = readFileSync(join(process.cwd(), "server/lib/runtimeEnv.ts"), "utf8");
    assert.ok(features.includes("GOODTRADING_AI_CRITICAL_CALIBRATION_ENABLED"));
    assert.ok(/envBool\(\s*["']GOODTRADING_AI_CRITICAL_CALIBRATION_ENABLED["']\s*,\s*false\s*\)/.test(features));
    assert.ok(runtime.includes("isGoodTradingAiCriticalCalibrationEnabledEnv"));
  });

  it("registers critical calibration endpoints", () => {
    const src = readFileSync(join(process.cwd(), "server/routes/criticalCalibration.routes.ts"), "utf8");
    assert.ok(src.includes("/status"));
    assert.ok(src.includes("/scenarios/generate"));
    assert.ok(src.includes("/scenarios/mutate"));
    assert.ok(src.includes("/review"));
    assert.ok(src.includes("/proposals/from-review"));
    assert.ok(src.includes("/proposals/:id/decide"));
    assert.ok(src.includes("/proposals"));
    assert.ok(src.includes("/questions/generate"));
    assert.ok(src.includes("/questions"));
    assert.ok(src.includes("/batch"));
    assert.ok(src.includes("/report"));
    assert.ok(src.includes("/metrics"));
    assert.ok(src.includes("/sessions/start"));
    assert.ok(src.includes("/sessions/:id/archive") || src.includes("/archive"));
    assert.ok(src.includes("/questions/summary") || src.includes("questions/summary"));
    assert.ok(src.includes("listSessionSummaries") || src.includes("/sessions"));
    assert.ok(src.includes("/questions/active-learning"));
    assert.ok(src.includes("/batch/generate"));
    assert.ok(src.includes("requireCriticalCalibrationAccess"));
    assert.ok(src.includes("mentorEligible: false"));
    assert.ok(!/from\s+['"].*openai/i.test(src));
    assert.ok(!/import\s+.*OpenAI/i.test(src));
  });

  it("shared contracts encode AI-7.3.1 evidence semantics", () => {
    const shared = readFileSync(join(process.cwd(), "shared/goodTradingAiCriticalCalibration.ts"), "utf8");
    assert.ok(shared.includes("EDGE_NOT_EMPIRICALLY_VALIDATED"));
    assert.ok(shared.includes("evidenceStatusSchema"));
    assert.ok(shared.includes("METHODOLOGICAL"));
    assert.ok(shared.includes("HYPOTHETICAL"));
    assert.ok(shared.includes("whyThisQuestion"));
    assert.ok(shared.includes("scoreComponents"));
    assert.ok(shared.includes("calibrationObservationSchema"));
    assert.ok(shared.includes("OBSERVED_BY_ENGINE"));
    assert.ok(shared.includes("QUESTION_PENDING"));
    assert.ok(shared.includes("HYPOTHESIS_ONLY"));
  });

  it("routes.ts registers critical calibration", () => {
    const src = readFileSync(join(process.cwd(), "server/routes.ts"), "utf8");
    assert.ok(src.includes("registerCriticalCalibrationRoutes"));
  });

  it("aiChat does not wire critical calibration live", () => {
    const src = readFileSync(join(process.cwd(), "server/routes/aiChat.routes.ts"), "utf8");
    assert.ok(!/critical-calibration|runCalibrationBatch|requireCriticalCalibrationAccess/.test(src));
  });

  it("contracts path has no BUY/SELL trading mandate fields", () => {
    const shared = readFileSync(join(process.cwd(), "shared/goodTradingAiCriticalCalibration.ts"), "utf8");
    assert.ok(!/\bside\s*:/.test(shared));
    assert.ok(!/\bwinRate\b/.test(shared));
    assert.ok(!/\bentry\s*:/.test(shared));
    assert.ok(!/z\.literal\(\s*["']BUY["']\s*\)/.test(shared));
    assert.ok(!/z\.literal\(\s*["']SELL["']\s*\)/.test(shared));
    assert.ok(shared.includes("FORBIDDEN_TRADING_OUTCOME_TOKENS") || shared.includes("mentorEligible"));
    assert.ok(shared.includes("mentorEligible"));
  });
});
