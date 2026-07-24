import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

describe("AI-7.3.6 knowledge provenance routes source", () => {
  it("flag defaults false via features/runtimeEnv", () => {
    const features = readFileSync(
      join(process.cwd(), "server/ai/goodTradingAi/knowledgeProvenance/features.ts"),
      "utf8",
    );
    const runtime = readFileSync(join(process.cwd(), "server/lib/runtimeEnv.ts"), "utf8");
    assert.ok(features.includes("GOODTRADING_AI_KNOWLEDGE_PROVENANCE_ENABLED"));
    assert.ok(/envBool\(\s*["']GOODTRADING_AI_KNOWLEDGE_PROVENANCE_ENABLED["']\s*,\s*false\s*\)/.test(features));
    assert.ok(runtime.includes("isGoodTradingAiKnowledgeProvenanceEnabledEnv"));
  });

  it("registers provenance endpoints and safety flags", () => {
    const src = readFileSync(join(process.cwd(), "server/routes/knowledgeProvenance.routes.ts"), "utf8");
    for (const path of [
      "/status",
      "/run",
      "/latest",
      "/registry",
      "/timeline",
      "/lineage",
      "/rationale",
      "/impact",
      "/query",
      "/proposal-context",
      "/related-rules",
    ]) {
      assert.ok(src.includes(path), `missing ${path}`);
    }
    assert.ok(src.includes("requireKnowledgeProvenanceAccess"));
    assert.ok(src.includes("brainMutate: false"));
    assert.ok(src.includes("NOT_SAFE_FOR_BRAIN_APPLICATION"));
    assert.ok(!/from\s+['"].*openai/i.test(src));
  });

  it("routes.ts registers knowledge provenance", () => {
    const src = readFileSync(join(process.cwd(), "server/routes.ts"), "utf8");
    assert.ok(src.includes("registerKnowledgeProvenanceRoutes"));
  });

  it("admin dashboard exists separate from evolution/distillation", () => {
    const page = readFileSync(join(process.cwd(), "client/src/pages/admin/KnowledgeProvenancePage.tsx"), "utf8");
    for (const label of ["Registry", "Timeline", "Lineage", "Rationale", "Impact", "Related Rules", "Proposal Context"]) {
      assert.ok(page.includes(label), `missing ${label}`);
    }
    assert.ok(!/applyToBrain|brainMutate:\s*true/.test(page));
    const router = readFileSync(join(process.cwd(), "client/src/AppRouter.tsx"), "utf8");
    assert.ok(router.includes("/admin/knowledge-provenance"));
    assert.ok(router.includes("/admin/knowledge-evolution"));
    assert.ok(router.includes("/admin/knowledge-distillation"));
    // Admin UX shell: nav links live in adminNav (AdminPage is users workspace).
    const adminNav = readFileSync(join(process.cwd(), "client/src/components/admin/shell/adminNav.ts"), "utf8");
    assert.ok(adminNav.includes("/admin/knowledge-provenance"));
  });
});