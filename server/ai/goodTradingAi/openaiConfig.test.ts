import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { estimateOpenAICostUsd, loadGoodTradingOpenAIConfig } from "./openaiConfig.ts";

const KEYS = [
  "GOODTRADING_AI_PROVIDER",
  "OPENAI_API_KEY",
  "OPENAI_MODEL",
  "OPENAI_MAX_OUTPUT_TOKENS",
  "OPENAI_TIMEOUT_MS",
  "OPENAI_REASONING_EFFORT",
  "OPENAI_STORE_RESPONSES",
  "GOODTRADING_AI_OPENAI_FALLBACK_TO_MOCK",
  "OPENAI_INPUT_USD_PER_1M",
  "OPENAI_OUTPUT_USD_PER_1M",
] as const;

const prev: Record<string, string | undefined> = {};
for (const k of KEYS) prev[k] = process.env[k];

afterEach(() => {
  for (const k of KEYS) {
    if (prev[k] === undefined) delete process.env[k];
    else process.env[k] = prev[k];
  }
});

describe("loadGoodTradingOpenAIConfig", () => {
  it("defaults to mock without key requirement", () => {
    delete process.env.GOODTRADING_AI_PROVIDER;
    delete process.env.OPENAI_API_KEY;
    const cfg = loadGoodTradingOpenAIConfig();
    assert.equal(cfg.provider, "mock");
    assert.equal(cfg.configured, true);
    assert.equal(cfg.storeResponses, false);
    assert.equal(cfg.fallbackToMock, false);
    assert.ok(cfg.maxOutputTokens >= 700 && cfg.maxOutputTokens <= 1200);
  });

  it("openai without key → configured false", () => {
    process.env.GOODTRADING_AI_PROVIDER = "openai";
    delete process.env.OPENAI_API_KEY;
    const cfg = loadGoodTradingOpenAIConfig();
    assert.equal(cfg.provider, "openai");
    assert.equal(cfg.configured, false);
  });

  it("openai with key → configured true", () => {
    process.env.GOODTRADING_AI_PROVIDER = "openai";
    process.env.OPENAI_API_KEY = "sk-test-not-real";
    process.env.OPENAI_MODEL = "gpt-4.1-mini";
    const cfg = loadGoodTradingOpenAIConfig();
    assert.equal(cfg.configured, true);
    assert.equal(cfg.model, "gpt-4.1-mini");
  });

  it("unknown provider falls back to mock", () => {
    process.env.GOODTRADING_AI_PROVIDER = "anthropic";
    const cfg = loadGoodTradingOpenAIConfig();
    assert.equal(cfg.provider, "mock");
  });

  it("clamps max output tokens", () => {
    process.env.OPENAI_MAX_OUTPUT_TOKENS = "50";
    assert.equal(loadGoodTradingOpenAIConfig().maxOutputTokens, 700);
    process.env.OPENAI_MAX_OUTPUT_TOKENS = "9999";
    assert.equal(loadGoodTradingOpenAIConfig().maxOutputTokens, 1200);
  });

  it("forces storeResponses false even if env true", () => {
    process.env.OPENAI_STORE_RESPONSES = "true";
    assert.equal(loadGoodTradingOpenAIConfig().storeResponses, false);
  });

  it("estimates cost when rates present", () => {
    process.env.OPENAI_INPUT_USD_PER_1M = "1";
    process.env.OPENAI_OUTPUT_USD_PER_1M = "2";
    const cfg = loadGoodTradingOpenAIConfig();
    const cost = estimateOpenAICostUsd(cfg, 1_000_000, 1_000_000);
    assert.equal(cost, 3);
  });

  it("cost null when rates missing", () => {
    delete process.env.OPENAI_INPUT_USD_PER_1M;
    delete process.env.OPENAI_OUTPUT_USD_PER_1M;
    const cfg = loadGoodTradingOpenAIConfig();
    assert.equal(estimateOpenAICostUsd(cfg, 100, 100), null);
  });
});
