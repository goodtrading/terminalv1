/**
 * AI-7.2 Human Methodology Review routes — source guards.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

describe("AI-7.2 decision human review routes source", () => {
  it("flag defaults false via features/runtimeEnv", () => {
    const features = readFileSync(
      join(process.cwd(), "server/ai/goodTradingAi/decision/humanReview/features.ts"),
      "utf8",
    );
    const runtime = readFileSync(join(process.cwd(), "server/lib/runtimeEnv.ts"), "utf8");
    assert.ok(features.includes("GOODTRADING_AI_DECISION_REVIEW_ENABLED"));
    assert.ok(/envBool\(\s*["']GOODTRADING_AI_DECISION_REVIEW_ENABLED["']\s*,\s*false\s*\)/.test(features) ||
      runtime.includes("GOODTRADING_AI_DECISION_REVIEW_ENABLED"));
    assert.ok(runtime.includes("isGoodTradingAiDecisionReviewEnabledEnv"));
    assert.match(runtime, /GOODTRADING_AI_DECISION_REVIEW_ENABLED[\s\S]{0,80}false/);
  });

  it("registers status/sessions/answers/reveal/report/proposals/packet", () => {
    const src = readFileSync(
      join(process.cwd(), "server/routes/decisionHumanReview.routes.ts"),
      "utf8",
    );
    assert.ok(src.includes("/status"));
    assert.ok(src.includes("/sessions"));
    assert.ok(src.includes("/answers"));
    assert.ok(src.includes("/reveal/"));
    assert.ok(src.includes("/report"));
    assert.ok(src.includes("/proposals"));
    assert.ok(src.includes("/packet"));
    assert.ok(src.includes("requireDecisionReviewAccess"));
    assert.ok(src.includes("mentorEligible: false"));
    assert.ok(!/from\s+['"].*openai/i.test(src));
    assert.ok(!/import\s+.*OpenAI/i.test(src));
  });

  it("routes.ts registers human review", () => {
    const src = readFileSync(join(process.cwd(), "server/routes.ts"), "utf8");
    assert.ok(src.includes("registerDecisionHumanReviewRoutes"));
  });

  it("aiChat does not wire human review / decision review live", () => {
    const src = readFileSync(join(process.cwd(), "server/routes/aiChat.routes.ts"), "utf8");
    assert.ok(
      !/decision-human-review|startBlindSession|revealAfterSubmit|submitHumanAnswer/.test(src),
    );
  });

  it("contracts path has no BUY/SELL trading mandate fields", () => {
    const shared = readFileSync(
      join(process.cwd(), "shared/goodTradingAiHumanReview.ts"),
      "utf8",
    );
    // Forbid mandate schema fields (side/entry/winRate); forbidden-token guards may cite names.
    assert.ok(!/\bside\s*:/.test(shared));
    assert.ok(!/\bwinRate\b/.test(shared));
    assert.ok(!/\bentry\s*:/.test(shared));
    assert.ok(!/z\.literal\(\s*["']BUY["']\s*\)/.test(shared));
    assert.ok(!/z\.literal\(\s*["']SELL["']\s*\)/.test(shared));
    assert.ok(shared.includes("FORBIDDEN_TRADING_OUTCOME_TOKENS") || shared.includes("mentorEligible"));
    assert.ok(shared.includes("mentorEligible"));
  });
});
