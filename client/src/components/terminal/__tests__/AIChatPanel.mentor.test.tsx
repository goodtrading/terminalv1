/**
 * UI render tests for GoodTrading AI Mentor panel (static markup).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MentorStructuredMessage } from "../MentorStructuredMessage.tsx";

describe("MentorStructuredMessage", () => {
  it("renders summary, observations, methodology refs, coverage and mock indicator", () => {
    const html = renderToStaticMarkup(
      createElement(MentorStructuredMessage, {
        timestamp: 1_700_000_000_000,
        structured: {
          summary: "Resumen mentor de prueba",
          observations: [
            {
              id: "gt_gamma_definition",
              kind: "definition",
              title: "Gamma (opciones)",
              detail: "Detalle educativo de gamma.",
              concepts: ["gamma"],
            },
          ],
          educationalNote: "Nota educativa — no es asesoramiento.",
          warnings: ["Sin mercado en vivo", "Mock experimental"],
          provider: { id: "mock", model: "mentor-knowledge-v2", mocked: true },
          requestId: "abcd1234-ffff-eeee-dddd-000011112222",
          coverage: "medium",
          knowledgeReferences: [
            {
              id: "gt_gamma_definition",
              title: "Qué es Gamma",
              kind: "DEFINITION",
              category: "gamma",
            },
          ],
        },
      }),
    );

    assert.ok(html.includes('data-testid="mentor-assistant-message"'));
    assert.ok(html.includes("Resumen mentor de prueba"));
    assert.ok(html.includes("Gamma (opciones)"));
    assert.ok(html.includes("Detalle educativo de gamma."));
    assert.ok(html.includes("Sin mercado en vivo"));
    assert.ok(html.includes("MOCK"));
    assert.ok(html.includes("Nota educativa"));
    assert.ok(html.includes('data-testid="mentor-methodology"'));
    assert.ok(html.includes("Metodología utilizada"));
    assert.ok(html.includes("Cobertura Media"));
  });

  it("renders OpenAI provider label when not mocked", () => {
    const html = renderToStaticMarkup(
      createElement(MentorStructuredMessage, {
        timestamp: 1_700_000_000_000,
        structured: {
          summary: "Resumen OpenAI mentor",
          observations: [],
          educationalNote: "Nota educativa — recuperación de metodología.",
          warnings: ["Sin mercado en vivo"],
          provider: { id: "openai", model: "gpt-4.1-mini", mocked: false },
          requestId: "abcd1234-ffff-eeee-dddd-000011112222",
          coverage: "high",
          knowledgeReferences: [],
        },
      }),
    );
    assert.ok(html.includes("OpenAI"));
    assert.ok(!html.includes(" · MOCK"));
    assert.ok(html.includes("Nota educativa"));
  });
});
