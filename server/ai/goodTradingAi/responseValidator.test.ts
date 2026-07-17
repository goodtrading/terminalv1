import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { validateMentorResponse } from "./responseValidator.ts";
import type { GoodTradingAIChatResponse } from "@shared/goodTradingAi";

function base(over: Partial<GoodTradingAIChatResponse> = {}): GoodTradingAIChatResponse {
  return {
    schemaVersion: "1.0",
    requestId: "r1",
    mode: "mentor",
    summary: "Resumen educativo sobre gamma.",
    observations: [
      {
        id: "gt_gamma_definition",
        kind: "definition",
        title: "Gamma",
        detail: "Definición",
      },
    ],
    educationalNote: "Nota educativa",
    warnings: [],
    provider: { id: "mock", model: "x", mocked: true },
    usage: { inputChars: 10, outputChars: 20, knowledgeHits: 1 },
    generatedAt: new Date().toISOString(),
    knowledgeReferences: [
      { id: "gt_gamma_definition", title: "Gamma", kind: "DEFINITION", category: "gamma" },
    ],
    coverage: "medium",
    ...over,
  };
}

describe("validateMentorResponse", () => {
  it("adds mandatory warnings", () => {
    const { response, ok } = validateMentorResponse(base());
    assert.equal(ok, true);
    assert.ok(response.warnings.some((w) => /educativo/i.test(w)));
  });

  it("blocks banned phrases", () => {
    const { response } = validateMentorResponse(
      base({ summary: "Te digo compra ahora el call wall porque wall confirma reversión" }),
    );
    assert.ok(!/compra ahora/i.test(response.summary));
    assert.ok(!/wall confirma reversión/i.test(response.summary));
  });

  it("dedupes knowledge references", () => {
    const { response } = validateMentorResponse(
      base({
        knowledgeReferences: [
          { id: "a", title: "A", kind: "RULE", category: "risk" },
          { id: "a", title: "A2", kind: "RULE", category: "risk" },
        ],
      }),
    );
    assert.equal(response.knowledgeReferences?.length, 1);
  });
});
