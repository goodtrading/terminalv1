import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

describe("AI-7.3.5 knowledge evolution routes source", () => {
  it("flag defaults false via features/runtimeEnv", () => {
    const features = readFileSync(
      join(process.cwd(), "server/ai/goodTradingAi/knowledgeEvolution/features.ts"),
      "utf8",
    );
    const runtime = readFileSync(join(process.cwd(), "server/lib/runtimeEnv.ts"), "utf8");
    assert.ok(features.includes("GOODTRADING_AI_KNOWLEDGE_EVOLUTION_ENABLED"));
    assert.ok(/envBool\(\s*["']GOODTRADING_AI_KNOWLEDGE_EVOLUTION_ENABLED["']\s*,\s*false\s*\)/.test(features));
    assert.ok(runtime.includes("isGoodTradingAiKnowledgeEvolutionEnabledEnv"));
  });

  it("registers evolution endpoints and safety flags", () => {
    const src = readFileSync(join(process.cwd(), "server/routes/knowledgeEvolution.routes.ts"), "utf8");
    for (const path of [
      "/status",
      "/run",
      "/latest",
      "/rules",
      "/dependencies",
      "/timeline",
      "/volatility",
      "/stability",
      "/health",
      "/obsolete",
      "/keystone",
      "/adaptive-priority",
      "/proposals",
      "/feedback",
    ]) {
      assert.ok(src.includes(path), `missing ${path}`);
    }
    assert.ok(src.includes("requireKnowledgeEvolutionAccess"));
    assert.ok(src.includes("mentorEligible: false"));
    assert.ok(src.includes("brainMutate: false"));
    assert.ok(src.includes("NOT_SAFE_FOR_BRAIN_APPLICATION"));
    assert.ok(!/from\s+['"].*openai/i.test(src));
  });

  it("routes.ts registers knowledge evolution", () => {
    const src = readFileSync(join(process.cwd(), "server/routes.ts"), "utf8");
    assert.ok(src.includes("registerKnowledgeEvolutionRoutes"));
  });

  it("admin dashboard exists separate from distillation", () => {
    const page = readFileSync(join(process.cwd(), "client/src/pages/admin/KnowledgeEvolutionPage.tsx"), "utf8");
    assert.ok(page.includes("Keystone"));
    assert.ok(page.includes("Obsolete"));
    assert.ok(page.includes("Timeline"));
    assert.ok(page.includes("knowledgeEvolutionApi"));
    assert.ok(!/applyToBrain|brainMutate:\s*true/.test(page));
    const router = readFileSync(join(process.cwd(), "client/src/AppRouter.tsx"), "utf8");
    assert.ok(router.includes("/admin/knowledge-evolution"));
    assert.ok(router.includes("/admin/knowledge-distillation"));
    const admin = readFileSync(join(process.cwd(), "client/src/pages/admin/AdminPage.tsx"), "utf8");
    assert.ok(admin.includes("/admin/knowledge-evolution"));
  });
});