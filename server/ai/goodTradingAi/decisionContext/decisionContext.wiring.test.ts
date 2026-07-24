/**
 * AI-8.1 — Wiring / non-wiring regression: no Mentor, KD, KE, KP, chat, OpenAI.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "../../../..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function listTs(dir: string): string[] {
  const abs = join(root, dir);
  return readdirSync(abs)
    .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
    .map((f) => join(dir, f).replace(/\\/g, "/"));
}

describe("AI-8.1 non-wiring contracts", () => {
  it("decisionContext module does not import Mentor/KD/KE/KP/chat/OpenAI", () => {
    const files = listTs("server/ai/goodTradingAi/decisionContext");
    assert.ok(files.length >= 4);
    for (const f of files) {
      const src = read(f);
      assert.doesNotMatch(
        src,
        /mentorKnowledge|openaiProvider|knowledgeDistillation|knowledgeEvolution|knowledgeProvenance|aiChat|evaluateDecisionGraph|buildMarketSnapshot|buildLiveInternalSnapshot/,
        f,
      );
      assert.doesNotMatch(src, /from ["'].*openai/i, f);
    }
  });

  it("recorder flags are always false literals in shared contract", () => {
    const src = read("shared/goodTradingAiDecisionContext.ts");
    assert.match(src, /mentorEligible: z\.literal\(false\)/);
    assert.match(src, /brainMutate: z\.literal\(false\)/);
    assert.match(src, /learning: z\.literal\(false\)/);
    assert.match(src, /autoApply: z\.literal\(false\)/);
    assert.match(src, /canUseDecisionContextForMentor\(\): false/);
  });

  it("BingX service hooks recorder without write paths", () => {
    const src = read("server/integrations/bingx/account/service.ts");
    assert.match(src, /recordFromBingxReconciliation/);
    assert.doesNotMatch(src, /privateWrite|placeOrder|cancelOrder/);
  });

  it("decision context routes are read-only GETs", () => {
    const src = read("server/routes/decisionContext.routes.ts");
    assert.match(src, /app\.get\(`/);
    assert.doesNotMatch(src, /app\.post\(|app\.put\(|app\.delete\(/);
    assert.doesNotMatch(src, /knowledgeDistillation|knowledgeEvolution|openai/i);
  });

  it("AI chat routes do not import decision context recorder", () => {
    const src = read("server/routes/aiChat.routes.ts");
    assert.doesNotMatch(src, /decisionContext|TradeDecision|recordFromBingx/);
  });

  it("recorder defaults OFF and exposes assertBingxWriteBlocked", () => {
    const flags = read("server/ai/goodTradingAi/decisionContext/flags.ts");
    assert.match(flags, /GOODTRADING_DECISION_CONTEXT_RECORDER_ENABLED\",\s*false\)/);
    assert.match(flags, /UNSAFE_NON_DURABLE_DECISION_CONTEXT_STORE/);
    const wg = read("server/integrations/bingx/account/writeGuard.ts");
    assert.match(wg, /export function assertBingxWriteBlocked/);
  });
});
