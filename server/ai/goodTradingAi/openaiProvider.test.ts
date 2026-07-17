import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { GoodTradingAIError } from "./errors.ts";
import { OpenAIGoodTradingAIProvider } from "./openaiProvider.ts";
import { FakeOpenAIResponsesClient } from "./openai/fakeClient.ts";
import { loadGoodTradingOpenAIConfig } from "./openaiConfig.ts";
import { createAIProvider } from "./provider.ts";
import { GoodTradingAIService } from "./service.ts";
import { resetProviderHealthForTests } from "./providerHealth.ts";

const ENV = [
  "GOODTRADING_AI_ENABLED",
  "GOODTRADING_AI_PROVIDER",
  "OPENAI_API_KEY",
  "GOODTRADING_AI_OPENAI_FALLBACK_TO_MOCK",
] as const;
const prev: Record<string, string | undefined> = {};
for (const k of ENV) prev[k] = process.env[k];

afterEach(() => {
  for (const k of ENV) {
    if (prev[k] === undefined) delete process.env[k];
    else process.env[k] = prev[k];
  }
  resetProviderHealthForTests();
});

function baseConfig() {
  process.env.GOODTRADING_AI_PROVIDER = "openai";
  process.env.OPENAI_API_KEY = "sk-test-fake";
  return loadGoodTradingOpenAIConfig();
}

describe("OpenAIGoodTradingAIProvider + Fake client", () => {
  it("success path normalizes to mentor contract", async () => {
    const fake = new FakeOpenAIResponsesClient({
      scenario: "success",
      knownIds: ["gt_gamma_definition"],
    });
    const provider = new OpenAIGoodTradingAIProvider({ client: fake, config: baseConfig() });
    const res = await provider.execute({
      requestId: "req-success",
      request: { schemaVersion: "1.0", mode: "mentor", message: "Qué es Gamma?" },
      timeoutMs: 5000,
    });
    assert.equal(res.provider.id, "openai");
    assert.equal(res.provider.mocked, false);
    assert.ok(res.summary.length > 10);
    assert.equal(fake.calls[0]?.store, false);
    assert.equal(fake.calls.length, 1);
    assert.ok(!JSON.stringify(fake.calls[0]).includes("sk-"));
  });

  it("maps timeout / 429 / 401", async () => {
    for (const [scenario, code] of [
      ["timeout", "OPENAI_TIMEOUT"],
      ["rate_limit", "OPENAI_RATE_LIMITED"],
      ["auth", "OPENAI_AUTH_ERROR"],
    ] as const) {
      const fake = new FakeOpenAIResponsesClient({ scenario });
      const provider = new OpenAIGoodTradingAIProvider({ client: fake, config: baseConfig() });
      await assert.rejects(
        () =>
          provider.execute({
            requestId: `req-${scenario}`,
            request: { schemaVersion: "1.0", mode: "mentor", message: "Gamma" },
            timeoutMs: 2000,
          }),
        (err: unknown) => err instanceof GoodTradingAIError && err.code === code,
      );
    }
  });

  it("bad json → OPENAI_BAD_RESPONSE", async () => {
    const fake = new FakeOpenAIResponsesClient({ scenario: "bad_json" });
    const provider = new OpenAIGoodTradingAIProvider({ client: fake, config: baseConfig() });
    await assert.rejects(
      () =>
        provider.execute({
          requestId: "req-bad",
          request: { schemaVersion: "1.0", mode: "mentor", message: "Gamma" },
          timeoutMs: 2000,
        }),
      (err: unknown) => err instanceof GoodTradingAIError && err.code === "OPENAI_BAD_RESPONSE",
    );
  });

  it("strips invented knowledge ids", async () => {
    const fake = new FakeOpenAIResponsesClient({
      scenario: "invented_ids",
      knownIds: ["gt_gamma_definition"],
    });
    const provider = new OpenAIGoodTradingAIProvider({ client: fake, config: baseConfig() });
    const res = await provider.execute({
      requestId: "req-ids",
      request: { schemaVersion: "1.0", mode: "mentor", message: "Qué es Gamma?" },
      timeoutMs: 5000,
    });
    const ids = (res.knowledgeReferences ?? []).map((r) => r.id);
    assert.ok(!ids.includes("gt_fake_invented_id"));
    assert.ok(!ids.includes("gt_another_fake"));
  });

  it("banned phrases are cleaned by validator via service", async () => {
    process.env.GOODTRADING_AI_ENABLED = "true";
    process.env.GOODTRADING_AI_PROVIDER = "openai";
    process.env.OPENAI_API_KEY = "sk-test-fake";
    const fake = new FakeOpenAIResponsesClient({
      scenario: "banned_phrases",
      knownIds: ["gt_gamma_definition"],
    });
    const svc = new GoodTradingAIService({
      providerDeps: { providerId: "openai", openaiClient: fake },
    });
    const res = await svc.handleChat({
      schemaVersion: "1.0",
      mode: "mentor",
      message: "Qué es Gamma?",
    });
    assert.ok(!/compra ahora/i.test(res.summary));
    assert.equal(res.provider.mocked, false);
  });

  it("factory without key → PROVIDER_CONFIGURATION_ERROR", () => {
    process.env.GOODTRADING_AI_PROVIDER = "openai";
    delete process.env.OPENAI_API_KEY;
    assert.throws(
      () => createAIProvider({ providerId: "openai" }),
      (err: unknown) => err instanceof GoodTradingAIError && err.code === "PROVIDER_CONFIGURATION_ERROR",
    );
  });

  it("retries once on rate_limit then succeeds", async () => {
    const flaky: FakeOpenAIResponsesClient = new FakeOpenAIResponsesClient({
      knownIds: ["gt_gamma_definition"],
    });
    let calls = 0;
    const original = flaky.create.bind(flaky);
    flaky.create = async (params) => {
      calls += 1;
      if (calls === 1) {
        const { OpenAIResponsesClientError } = await import("./openai/responsesClient.ts");
        throw new OpenAIResponsesClientError("rate_limit", "429", { status: 429, retryable: true });
      }
      flaky.setScenario("success");
      return original(params);
    };
    const provider = new OpenAIGoodTradingAIProvider({ client: flaky, config: baseConfig() });
    const res = await provider.execute({
      requestId: "req-retry",
      request: { schemaVersion: "1.0", mode: "mentor", message: "Gamma" },
      timeoutMs: 5000,
    });
    assert.equal(calls, 2);
    assert.equal(res.provider.id, "openai");
  });

  it("fallback to mock when flag enabled", async () => {
    process.env.GOODTRADING_AI_ENABLED = "true";
    process.env.GOODTRADING_AI_PROVIDER = "openai";
    process.env.OPENAI_API_KEY = "sk-test-fake";
    process.env.GOODTRADING_AI_OPENAI_FALLBACK_TO_MOCK = "true";
    const fake = new FakeOpenAIResponsesClient({ scenario: "unavailable" });
    const svc = new GoodTradingAIService({
      providerDeps: { providerId: "openai", openaiClient: fake },
    });
    const res = await svc.handleChat({
      schemaVersion: "1.0",
      mode: "mentor",
      message: "Qué es Absorption?",
    });
    assert.equal(res.provider.mocked, true);
    assert.ok(res.warnings.some((w) => /Fallback a mock/i.test(w)));
  });

  it("default: OpenAI fail does not silent-mock", async () => {
    process.env.GOODTRADING_AI_ENABLED = "true";
    process.env.GOODTRADING_AI_PROVIDER = "openai";
    process.env.OPENAI_API_KEY = "sk-test-fake";
    delete process.env.GOODTRADING_AI_OPENAI_FALLBACK_TO_MOCK;
    const fake = new FakeOpenAIResponsesClient({ scenario: "unavailable" });
    const svc = new GoodTradingAIService({
      providerDeps: { providerId: "openai", openaiClient: fake },
    });
    await assert.rejects(
      () =>
        svc.handleChat({
          schemaVersion: "1.0",
          mode: "mentor",
          message: "Gamma",
        }),
      (err: unknown) => err instanceof GoodTradingAIError && err.code === "OPENAI_UNAVAILABLE",
    );
  });
});
