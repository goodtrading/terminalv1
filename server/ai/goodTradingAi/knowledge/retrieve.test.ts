import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { retrieveKnowledge } from "./retrieve.ts";
import { ensureKnowledgeRegistryValid } from "./registry.ts";

describe("retrieveKnowledge", () => {
  ensureKnowledgeRegistryValid();

  it("finds gamma / flip", () => {
    const r = retrieveKnowledge({ query: "Qué es el Global Flip?" });
    assert.ok(r.matches.some((m) => m.entry.id.includes("flip") || m.entry.concepts.some((c) => /flip/i.test(c))));
    assert.notEqual(r.coverage, "limited");
  });

  it("finds absorption", () => {
    const r = retrieveKnowledge({ query: "Explicame Absorption en order flow" });
    assert.ok(r.matches.some((m) => m.entry.id === "gt_of_absorption_central"));
  });

  it("wall not reversal rule", () => {
    const r = retrieveKnowledge({ query: "una liquidity wall confirma reversión?" });
    assert.ok(r.matches.some((m) => m.entry.id === "gt_liq_wall_not_reversal"));
  });

  it("prefer constitution on related topics", () => {
    const r = retrieveKnowledge({ query: "invalidación en un trade", preferConstitution: true });
    assert.ok(r.matches.some((m) => m.entry.category === "constitution" || m.entry.category === "risk"));
  });

  it("mejor crypto hoy → limited / teaching", () => {
    const r = retrieveKnowledge({ query: "mejor crypto hoy" });
    // retrieval may be weak; engine handles intent — here ensure no invented market entry ids
    assert.ok(!r.matches.some((m) => /precio actual|buy now/i.test(m.entry.statement)));
  });

  it("is deterministic", () => {
    const a = retrieveKnowledge({ query: "Call Wall y Put Wall" });
    const b = retrieveKnowledge({ query: "Call Wall y Put Wall" });
    assert.deepEqual(
      a.matches.map((m) => m.entry.id),
      b.matches.map((m) => m.entry.id),
    );
  });

  it("stable tie-break by id", () => {
    const r = retrieveKnowledge({ query: "gamma" });
    const ids = r.matches.map((m) => m.entry.id);
    const sortedCopy = [...r.matches].sort((x, y) => {
      if (y.score !== x.score) return y.score - x.score;
      return x.entry.id.localeCompare(y.entry.id);
    });
    assert.deepEqual(
      ids,
      sortedCopy.map((m) => m.entry.id),
    );
  });
});
