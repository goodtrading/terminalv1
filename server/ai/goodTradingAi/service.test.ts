import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { GoodTradingAIError } from "./errors.ts";
import { GoodTradingAIService } from "./service.ts";

const ENV_FLAG = "GOODTRADING_AI_ENABLED";
const prev = process.env[ENV_FLAG];

afterEach(() => {
  if (prev === undefined) delete process.env[ENV_FLAG];
  else process.env[ENV_FLAG] = prev;
});

describe("GoodTradingAIService", () => {
  it("rejects when flag is off", async () => {
    delete process.env[ENV_FLAG];
    const svc = new GoodTradingAIService();
    await assert.rejects(
      () => svc.handleChat({ schemaVersion: "1.0", mode: "mentor", message: "Gamma" }),
      (err: unknown) => err instanceof GoodTradingAIError && err.code === "AI_DISABLED",
    );
  });

  it("rejects non-mentor modes", async () => {
    process.env[ENV_FLAG] = "true";
    const svc = new GoodTradingAIService();
    await assert.rejects(
      () => svc.handleChat({ schemaVersion: "1.0", mode: "market", message: "Gamma" }),
      (err: unknown) => err instanceof GoodTradingAIError && err.code === "MODE_NOT_AVAILABLE",
    );
  });

  it("returns structured mentor response when enabled", async () => {
    process.env[ENV_FLAG] = "true";
    const svc = new GoodTradingAIService();
    const res = await svc.handleChat({
      schemaVersion: "1.0",
      mode: "mentor",
      message: "Explicame Absorption",
    });
    assert.equal(res.schemaVersion, "1.0");
    assert.equal(res.mode, "mentor");
    assert.equal(res.provider.mocked, true);
    assert.ok(res.requestId);
    assert.ok(res.warnings.length >= 2);
    assert.ok(res.usage.inputChars > 0);
  });

  it("rejects invalid payloads", async () => {
    process.env[ENV_FLAG] = "true";
    const svc = new GoodTradingAIService();
    await assert.rejects(
      () => svc.handleChat({ schemaVersion: "1.0", mode: "mentor", message: "" }),
      (err: unknown) => err instanceof GoodTradingAIError && err.code === "INVALID_REQUEST",
    );
  });
});
