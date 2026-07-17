import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MockGoodTradingAIProvider } from "./mockProvider.ts";
import { ensureKnowledgeRegistryValid } from "./knowledge/registry.ts";

describe("MockGoodTradingAIProvider AI-2", () => {
  ensureKnowledgeRegistryValid();

  it("returns mocked educational response with references", async () => {
    const provider = new MockGoodTradingAIProvider();
    const result = await provider.execute({
      requestId: "req-test-1",
      request: { schemaVersion: "1.0", mode: "mentor", message: "Qué es un Call Wall?" },
      timeoutMs: 5000,
    });
    assert.equal(result.provider.mocked, true);
    assert.equal(result.provider.id, "mock");
    assert.ok(result.observations.length >= 1);
    assert.ok((result.knowledgeReferences?.length ?? 0) >= 1);
    assert.ok(result.educationalNote.length > 0);
    assert.ok(result.warnings.some((w) => /mock|experimental|vivo/i.test(w)));
  });

  it("does not invent market analysis for unknown topics", async () => {
    const provider = new MockGoodTradingAIProvider();
    const result = await provider.execute({
      requestId: "req-test-2",
      request: { schemaVersion: "1.0", mode: "mentor", message: "precio exacto de BTC mañana" },
      timeoutMs: 5000,
    });
    assert.ok(/cobertura limitada|no encontr|no puedo|metodolog/i.test(result.summary));
    assert.ok(!/btc est[aá] en \d+/i.test(result.summary));
  });

  it("redirects current-market questions", async () => {
    const provider = new MockGoodTradingAIProvider();
    const result = await provider.execute({
      requestId: "req-test-3",
      request: { schemaVersion: "1.0", mode: "mentor", message: "mejor crypto hoy" },
      timeoutMs: 5000,
    });
    assert.equal(result.coverage, "limited");
    assert.ok(/no puedo analizar el mercado actual|no hay|en vivo/i.test(result.summary));
  });
});
