import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MENTOR_KNOWLEDGE, selectMentorKnowledge } from "./mentorKnowledge.ts";
import { ensureKnowledgeRegistryValid } from "./knowledge/registry.ts";

describe("selectMentorKnowledge (AI-2 shim)", () => {
  ensureKnowledgeRegistryValid();

  it("selects gamma-related entries", () => {
    const hits = selectMentorKnowledge("Explicame qué es Gamma en opciones");
    assert.ok(hits.some((h) => /gamma/i.test(h.id + h.title + h.concepts.join(" "))));
  });

  it("selects global flip for flip questions", () => {
    const hits = selectMentorKnowledge("Qué significa el Global Flip?");
    assert.ok(hits.some((h) => /flip/i.test(h.id + h.title)));
  });

  it("is deterministic for the same message", () => {
    const a = selectMentorKnowledge("Absorption y liquidez en el DOM");
    const b = selectMentorKnowledge("Absorption y liquidez en el DOM");
    assert.deepEqual(
      a.map((x) => x.id),
      b.map((x) => x.id),
    );
  });

  it("returns empty or limited for unrelated questions", () => {
    const hits = selectMentorKnowledge("Cuál es el clima en Marte hoy?");
    assert.ok(hits.length <= 2);
  });

  it("legacy MENTOR_KNOWLEDGE mirrors registry size ≥70", () => {
    assert.ok(MENTOR_KNOWLEDGE.length >= 70);
  });
});
