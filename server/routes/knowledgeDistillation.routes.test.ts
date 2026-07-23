import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

describe("AI-7.3.4 knowledge distillation routes source", () => {
  it("flag defaults false via features/runtimeEnv", () => {
    const features = readFileSync(join(process.cwd(), "server/ai/goodTradingAi/knowledgeDistillation/features.ts"), "utf8");
    const runtime = readFileSync(join(process.cwd(), "server/lib/runtimeEnv.ts"), "utf8");
    assert.ok(features.includes("GOODTRADING_AI_KNOWLEDGE_DISTILLATION_ENABLED"));
    assert.ok(/envBool\(\s*["']GOODTRADING_AI_KNOWLEDGE_DISTILLATION_ENABLED["']\s*,\s*false\s*\)/.test(features));
    assert.ok(runtime.includes("isGoodTradingAiKnowledgeDistillationEnabledEnv"));
  });

  it("registers distillation endpoints and safety flags", () => {
    const src = readFileSync(join(process.cwd(), "server/routes/knowledgeDistillation.routes.ts"), "utf8");
    assert.ok(src.includes("/status"));
    assert.ok(src.includes("/run"));
    assert.ok(src.includes("/heatmaps"));
    assert.ok(src.includes("/challenges"));
    assert.ok(src.includes("/proposals"));
    assert.ok(src.includes("requireKnowledgeDistillationAccess"));
    assert.ok(src.includes("mentorEligible: false"));
    assert.ok(src.includes("brainMutate: false"));
    assert.ok(src.includes("NOT_SAFE_FOR_BRAIN_APPLICATION"));
    assert.ok(!/from\s+['"].*openai/i.test(src));
  });

  it("routes.ts registers knowledge distillation", () => {
    const src = readFileSync(join(process.cwd(), "server/routes.ts"), "utf8");
    assert.ok(src.includes("registerKnowledgeDistillationRoutes"));
  });

  it("admin UI exists and has no Brain apply", () => {
    const page = readFileSync(join(process.cwd(), "client/src/pages/admin/KnowledgeDistillationPage.tsx"), "utf8");
    assert.ok(page.includes("Challenge Me"));
    assert.ok(page.includes("knowledgeDistillationApi"));
    assert.ok(!/applyToBrain|brainMutate:\s*true/.test(page));
    const router = readFileSync(join(process.cwd(), "client/src/AppRouter.tsx"), "utf8");
    assert.ok(router.includes("/admin/knowledge-distillation"));
  });
});