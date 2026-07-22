/**
 * AI-7 Decision Graph routes — flag gating (no live chat wiring).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

describe("AI-7 decision graph routes source", () => {
  it("registers evaluate/templates/status", () => {
    const src = readFileSync(
      join(process.cwd(), "server/routes/decisionGraph.routes.ts"),
      "utf8",
    );
    assert.ok(src.includes("/evaluate"));
    assert.ok(src.includes("/templates"));
    assert.ok(src.includes("/status"));
    assert.ok(src.includes("requireDecisionGraphAccess"));
    assert.ok(!/from\s+['\"].*openai/i.test(src));
    assert.ok(!/import\s+.*OpenAI/i.test(src));
  });
  it("routes.ts registers decision graph", () => {
    const src = readFileSync(join(process.cwd(), "server/routes.ts"), "utf8");
    assert.ok(src.includes("registerDecisionGraphRoutes"));
  });
  it("aiChat does not wire decision graph live snapshot", () => {
    const src = readFileSync(join(process.cwd(), "server/routes/aiChat.routes.ts"), "utf8");
    assert.ok(!/decision-graph|evaluateDecisionGraph|buildStubSnapshot|live_internal/.test(src));
  });
});
