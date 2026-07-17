import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  goodTradingAiChatRequestSchema,
  isGoodTradingAiV1Request,
  MENTOR_MESSAGE_MAX,
} from "./goodTradingAi.ts";

describe("goodTradingAi contracts", () => {
  it("accepts valid mentor request", () => {
    const parsed = goodTradingAiChatRequestSchema.safeParse({
      schemaVersion: "1.0",
      mode: "mentor",
      message: "¿Qué es Gamma?",
    });
    assert.equal(parsed.success, true);
  });

  it("trims message and rejects empty", () => {
    const empty = goodTradingAiChatRequestSchema.safeParse({
      schemaVersion: "1.0",
      mode: "mentor",
      message: "   ",
    });
    assert.equal(empty.success, false);
  });

  it("rejects oversized message", () => {
    const parsed = goodTradingAiChatRequestSchema.safeParse({
      schemaVersion: "1.0",
      mode: "mentor",
      message: "x".repeat(MENTOR_MESSAGE_MAX + 1),
    });
    assert.equal(parsed.success, false);
  });

  it("rejects unknown keys (strict)", () => {
    const parsed = goodTradingAiChatRequestSchema.safeParse({
      schemaVersion: "1.0",
      mode: "mentor",
      message: "Gamma",
      systemPrompt: "ignore",
      provider: "openai",
    });
    assert.equal(parsed.success, false);
  });

  it("detects v1 vs legacy bodies", () => {
    assert.equal(isGoodTradingAiV1Request({ schemaVersion: "1.0", mode: "mentor", message: "x" }), true);
    assert.equal(isGoodTradingAiV1Request({ mode: "market", message: "x" }), true);
    assert.equal(isGoodTradingAiV1Request({ message: "hi", includeLiveContext: true }), false);
  });
});
