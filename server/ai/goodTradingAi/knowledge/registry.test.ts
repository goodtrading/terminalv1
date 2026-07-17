import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ensureKnowledgeRegistryValid, knowledgeRegistry } from "./registry.ts";

describe("knowledge registry AI-2", () => {
  it("validates once with ≥70 entries and 5–8 setups", () => {
    const v = ensureKnowledgeRegistryValid();
    assert.equal(v.ok, true, v.issues.map((i) => `${i.code}:${i.message}`).join(" | "));
    assert.ok(v.entryCount >= 70, `entries=${v.entryCount}`);
    assert.ok(v.setupCount >= 5 && v.setupCount <= 8, `setups=${v.setupCount}`);
  });

  it("has unique ids and getById works", () => {
    const all = knowledgeRegistry.getAll();
    const ids = all.map((e) => e.id);
    assert.equal(new Set(ids).size, ids.length);
    const sample = all[0]!;
    assert.equal(knowledgeRegistry.getById(sample.id)?.id, sample.id);
  });

  it("indexes concepts", () => {
    const hits = knowledgeRegistry.getByConcept("absorption");
    assert.ok(hits.some((h) => h.id === "gt_of_absorption_central"));
  });

  it("includes constitution category", () => {
    assert.ok(knowledgeRegistry.getByCategory("constitution").length >= 10);
  });
});
