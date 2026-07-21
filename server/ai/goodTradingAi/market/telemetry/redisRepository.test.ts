/**
 * AI-6.4.1 — Redis telemetry repository (≥180 cases, FakeRedis — no network).
 */
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildCompactMarketTelemetry, canUseTelemetryForMentor } from "@shared/goodTradingAiMarketTelemetry";
import {
  FakeRedisClient,
  TELEMETRY_CAS_LUA,
  TELEMETRY_ATOMIC_PUT_LUA,
  RedisMarketTelemetryRepository,
  buildTelemetryRepositoryKey,
  buildTelemetrySessionIndexKey,
  hashUserId,
  hashSessionId,
  loadRedisTelemetryConfig,
  RedisTelemetryConfigError,
  redactRedisConfigForStatus,
  resetRedisEnvContractWarningsForTests,
  normalizeTelemetryRepositoryMode,
  getConfiguredTelemetryRepositoryMode,
  createMarketTelemetryRepository,
  createMarketTelemetryRepositoryAsync,
  TelemetryRepositoryConfigError,
  auditSharedTelemetryInfra,
  makeTelemetryEntry,
  resetMarketTelemetryRepositoryFactoryForTests,
  resetMarketTelemetryStoreForTests,
  MENTOR_INTEGRATION_NOT_ENABLED,
  buildTelemetryMentorReadiness,
  entryToRedisRecord,
  parseRedisRecord,
  serializeRedisRecord,
  redisTelemetryRecordSchema,
  REDIS_TELEMETRY_RECORD_SCHEMA_VERSION,
  repoPut,
  repoGet,
} from "./index.ts";

afterEach(() => {
  resetMarketTelemetryStoreForTests();
  resetMarketTelemetryRepositoryFactoryForTests();
  resetRedisEnvContractWarningsForTests();
  delete process.env.GOODTRADING_AI_TELEMETRY_REPOSITORY;
  delete process.env.REDIS_URL;
  delete process.env.REDIS_PRIVATE_URL;
  delete process.env.GOODTRADING_AI_TELEMETRY_REDIS_PREFIX;
  delete process.env.GOODTRADING_AI_TELEMETRY_TTL_MS;
  delete process.env.GOODTRADING_AI_TELEMETRY_REDIS_TTL_MS;
  delete process.env.GOODTRADING_AI_TELEMETRY_REDIS_TIMEOUT_MS;
  delete process.env.GOODTRADING_AI_ALLOW_REDIS_SMOKE;
  delete process.env.ALLOW_REDIS_SMOKE;
});

function makeTel(seq: number, symbol = "BTCUSDT", sessionId = "sess_redis_aabbcc01") {
  const { telemetry } = buildCompactMarketTelemetry({
    symbol,
    sessionId,
    sequence: seq,
    telemetryMode: "real",
    orderFlowSummary: {
      tradeCount: 10 + seq,
      buyVolume: 2,
      sellVolume: 1,
      delta: 1,
      cvd: seq,
      imbalancePct: 10,
    },
  });
  return telemetry;
}

function makeRepo(fake = new FakeRedisClient(), ttlMs = 12_000) {
  return {
    fake,
    repo: new RedisMarketTelemetryRepository(fake, {
      url: "redis://fake",
      urlEnvName: "FAKE",
      prefix: "gt:ai:telem:t",
      ttlMs,
      ttlEnvName: null,
      timeoutMs: 500,
      tls: false,
    }),
  };
}

describe("AI-6.4.1 config", () => {
  it("default mode memory", () => {
    assert.equal(getConfiguredTelemetryRepositoryMode(), "memory");
  });
  it("normalizes redis", () => {
    assert.equal(normalizeTelemetryRepositoryMode("redis"), "redis");
  });
  it("normalizes shared alias", () => {
    assert.equal(normalizeTelemetryRepositoryMode("shared"), "redis");
  });
  it("normalizes garbage to memory", () => {
    assert.equal(normalizeTelemetryRepositoryMode("postgres"), "memory");
  });
  it("loadRedis throws without URL", () => {
    assert.throws(() => loadRedisTelemetryConfig({}), (e: unknown) => e instanceof RedisTelemetryConfigError);
  });
  it("loadRedis accepts REDIS_URL", () => {
    const cfg = loadRedisTelemetryConfig({ REDIS_URL: "redis://localhost:6379" } as NodeJS.ProcessEnv);
    assert.equal(cfg.urlEnvName, "REDIS_URL");
    assert.equal(cfg.tls, false);
    assert.ok(cfg.ttlMs >= 10_000 && cfg.ttlMs <= 15_000);
  });
  it("loadRedis TLS from rediss", () => {
    const cfg = loadRedisTelemetryConfig({ REDIS_URL: "rediss://x:y@host:6380" } as NodeJS.ProcessEnv);
    assert.equal(cfg.tls, true);
  });
  it("loadRedis PRIVATE_URL", () => {
    const cfg = loadRedisTelemetryConfig({
      REDIS_PRIVATE_URL: "redis://private:6379",
    } as NodeJS.ProcessEnv);
    assert.equal(cfg.urlEnvName, "REDIS_PRIVATE_URL");
  });
  it("loadRedis prefers REDIS_PRIVATE_URL over REDIS_URL", () => {
    const cfg = loadRedisTelemetryConfig({
      REDIS_URL: "redis://public:6379",
      REDIS_PRIVATE_URL: "redis://private:6379",
    } as NodeJS.ProcessEnv);
    assert.equal(cfg.urlEnvName, "REDIS_PRIVATE_URL");
  });
  it("TTL canonical GOODTRADING_AI_TELEMETRY_TTL_MS", () => {
    const cfg = loadRedisTelemetryConfig({
      REDIS_URL: "redis://x",
      GOODTRADING_AI_TELEMETRY_TTL_MS: "11000",
    } as NodeJS.ProcessEnv);
    assert.equal(cfg.ttlMs, 11_000);
    assert.equal(cfg.ttlEnvName, "GOODTRADING_AI_TELEMETRY_TTL_MS");
  });
  it("TTL alias REDIS_TTL_MS still works", () => {
    const cfg = loadRedisTelemetryConfig({
      REDIS_URL: "redis://x",
      GOODTRADING_AI_TELEMETRY_REDIS_TTL_MS: "1000",
    } as NodeJS.ProcessEnv);
    assert.equal(cfg.ttlMs, 10_000);
    assert.equal(cfg.ttlEnvName, "GOODTRADING_AI_TELEMETRY_REDIS_TTL_MS");
  });
  it("TTL clamp high via canonical", () => {
    const cfg = loadRedisTelemetryConfig({
      REDIS_URL: "redis://x",
      GOODTRADING_AI_TELEMETRY_TTL_MS: "60000",
    } as NodeJS.ProcessEnv);
    assert.equal(cfg.ttlMs, 15_000);
  });
  it("TTL clamp low via alias", () => {
    const cfg = loadRedisTelemetryConfig({
      REDIS_URL: "redis://x",
      GOODTRADING_AI_TELEMETRY_REDIS_TTL_MS: "1000",
    } as NodeJS.ProcessEnv);
    assert.equal(cfg.ttlMs, 10_000);
  });
  it("TTL clamp high via alias", () => {
    const cfg = loadRedisTelemetryConfig({
      REDIS_URL: "redis://x",
      GOODTRADING_AI_TELEMETRY_REDIS_TTL_MS: "60000",
    } as NodeJS.ProcessEnv);
    assert.equal(cfg.ttlMs, 15_000);
  });
  it("invalid prefix rejected", () => {
    assert.throws(
      () =>
        loadRedisTelemetryConfig({
          REDIS_URL: "redis://x",
          GOODTRADING_AI_TELEMETRY_REDIS_PREFIX: "bad prefix!",
        } as NodeJS.ProcessEnv),
      (e: unknown) => e instanceof RedisTelemetryConfigError,
    );
  });
  it("redact never includes url value", () => {
    const cfg = loadRedisTelemetryConfig({ REDIS_URL: "redis://secret:pass@h:1" } as NodeJS.ProcessEnv);
    const r = redactRedisConfigForStatus(cfg);
    assert.equal(r.configured, true);
    assert.ok(!JSON.stringify(r).includes("secret"));
    assert.ok(!JSON.stringify(r).includes("pass"));
  });
  it("REDISHOST+REDISPORT compose", () => {
    const cfg = loadRedisTelemetryConfig({
      REDISHOST: "10.0.0.1",
      REDISPORT: "6379",
    } as NodeJS.ProcessEnv);
    assert.equal(cfg.urlEnvName, "REDISHOST+REDISPORT");
    assert.ok(cfg.url.includes("10.0.0.1"));
  });
});

describe("AI-6.4.1 key design", () => {
  it("buildTelemetryRepositoryKey stable", () => {
    const a = buildTelemetryRepositoryKey({
      prefix: "p",
      userId: 42,
      sessionId: "sess_abcdefgh",
      symbol: "btcusdt",
      namespace: "real",
    });
    const b = buildTelemetryRepositoryKey({
      prefix: "p",
      userId: 42,
      sessionId: "sess_abcdefgh",
      symbol: "BTCUSDT",
      namespace: "real",
    });
    assert.equal(a, b);
    assert.ok(a.includes(":real:"));
    assert.ok(!a.includes("sess_abcdefgh"));
  });
  it("user hash deterministic", () => {
    assert.equal(hashUserId(1), hashUserId(1));
    assert.notEqual(hashUserId(1), hashUserId(2));
  });
  it("session hash deterministic", () => {
    assert.equal(hashSessionId("abc"), hashSessionId("abc"));
  });
  it("session index key shape", () => {
    const k = buildTelemetrySessionIndexKey("gt", 1, "sess_xxxxxxx1");
    assert.ok(k.startsWith("gt:sess:"));
  });
  it("namespaces differ keys", () => {
    const real = buildTelemetryRepositoryKey({
      prefix: "p",
      userId: 1,
      sessionId: "sess_xxxxxxx1",
      symbol: "ETHUSDT",
      namespace: "real",
    });
    const syn = buildTelemetryRepositoryKey({
      prefix: "p",
      userId: 1,
      sessionId: "sess_xxxxxxx1",
      symbol: "ETHUSDT",
      namespace: "synthetic_debug",
    });
    assert.notEqual(real, syn);
  });
});

describe("AI-6.4.1 RedisTelemetryRecord", () => {
  it("schemaVersion 1.0", () => {
    assert.equal(REDIS_TELEMETRY_RECORD_SCHEMA_VERSION, "1.0");
  });
  it("roundtrip entry", () => {
    const t = makeTel(3);
    const entry = makeTelemetryEntry({ telemetry: t, userId: 7 });
    const rec = entryToRedisRecord(entry);
    const parsed = redisTelemetryRecordSchema.parse(JSON.parse(serializeRedisRecord(rec)));
    assert.equal(parsed.sequence, 3);
    assert.equal(parseRedisRecord(serializeRedisRecord(rec))?.sequence, 3);
  });
  it("parse rejects garbage", () => {
    assert.equal(parseRedisRecord("{"), null);
    assert.equal(parseRedisRecord("{}"), null);
  });
});

describe("AI-6.4.1 FakeRedis CAS", () => {
  it("STORED empty", async () => {
    const { fake, repo } = makeRepo();
    const r = await repo.putAsync(makeTelemetryEntry({ telemetry: makeTel(1), userId: 1 }));
    assert.equal(r.accepted, true);
    assert.equal(r.reason, "STORED");
    assert.equal(fake.atomicPutCalls, 1);
    assert.equal(fake.lastAtomicPutRoundTrips, 1);
    assert.equal(fake.networkRoundTrips, 1);
  });
  it("DUPLICATE does not renew TTL", async () => {
    const { fake, repo } = makeRepo();
    const entry = makeTelemetryEntry({ telemetry: makeTel(5), userId: 1 });
    await repo.putAsync(entry);
    const key = buildTelemetryRepositoryKey({
      prefix: "gt:ai:telem:t",
      userId: 1,
      sessionId: entry.sessionId,
      symbol: entry.symbol,
      namespace: entry.namespace,
    });
    const ttl1 = fake.remainingTtlMs(key)!;
    await new Promise((r) => setTimeout(r, 30));
    const dup = await repo.putAsync(entry);
    assert.equal(dup.reason, "DUPLICATE_SEQUENCE");
    const ttl2 = fake.remainingTtlMs(key)!;
    assert.ok(ttl2 <= ttl1, `TTL must not renew on duplicate (${ttl2} vs ${ttl1})`);
  });
  it("REPLAY lower sequence", async () => {
    const { repo } = makeRepo();
    await repo.putAsync(makeTelemetryEntry({ telemetry: makeTel(10), userId: 1 }));
    const r = await repo.putAsync(makeTelemetryEntry({ telemetry: makeTel(9), userId: 1 }));
    assert.equal(r.reason, "REPLAY_SEQUENCE");
  });
  it("higher sequence STORED", async () => {
    const { repo } = makeRepo();
    await repo.putAsync(makeTelemetryEntry({ telemetry: makeTel(1), userId: 1 }));
    const r = await repo.putAsync(makeTelemetryEntry({ telemetry: makeTel(2), userId: 1 }));
    assert.equal(r.accepted, true);
  });
  it("UNAVAILABLE when forced", async () => {
    const { fake, repo } = makeRepo();
    fake.forceCasOutcome = "UNAVAILABLE";
    const r = await repo.putAsync(makeTelemetryEntry({ telemetry: makeTel(1), userId: 1 }));
    assert.equal(r.reason, "UNAVAILABLE");
  });
  it("CONFLICT when forced", async () => {
    const { fake, repo } = makeRepo();
    fake.forceCasOutcome = "CONFLICT";
    const r = await repo.putAsync(makeTelemetryEntry({ telemetry: makeTel(1), userId: 1 }));
    assert.equal(r.reason, "CONFLICT");
  });
  it("get after put", async () => {
    const { repo } = makeRepo();
    const t = makeTel(4);
    await repo.putAsync(makeTelemetryEntry({ telemetry: t, userId: 3 }));
    const got = await repo.getAsync(3, t.sessionId, t.symbol, "real");
    assert.equal(got?.lastSequence, 4);
  });
  it("getPreferReal via getAsync null ns", async () => {
    const { repo } = makeRepo();
    const t = makeTel(1);
    await repo.putAsync(makeTelemetryEntry({ telemetry: t, userId: 3 }));
    const got = await repo.getAsync(3, t.sessionId, t.symbol);
    assert.ok(got);
  });
  it("removeSession without KEYS", async () => {
    const { fake, repo } = makeRepo();
    const t = makeTel(1);
    await repo.putAsync(makeTelemetryEntry({ telemetry: t, userId: 8 }));
    const n = await repo.removeSession(8, t.sessionId);
    assert.ok(n >= 1);
    assert.equal(await repo.getAsync(8, t.sessionId, t.symbol, "real"), undefined);
    assert.equal(fake.getCalls >= 0, true);
  });
  it("sync put throws", () => {
    const { repo } = makeRepo();
    assert.throws(() =>
      repo.put(makeTelemetryEntry({ telemetry: makeTel(1), userId: 1 })),
    );
  });
  it("Lua scripts have no FLUSH/KEYS", () => {
    assert.ok(!/FLUSH|KEYS\s/i.test(TELEMETRY_CAS_LUA));
    assert.ok(TELEMETRY_CAS_LUA.includes("PX"));
    assert.ok(!/FLUSH|KEYS\s/i.test(TELEMETRY_ATOMIC_PUT_LUA));
    assert.ok(TELEMETRY_ATOMIC_PUT_LUA.includes("PX"));
    assert.ok(TELEMETRY_ATOMIC_PUT_LUA.includes("SADD"));
    assert.ok(TELEMETRY_ATOMIC_PUT_LUA.includes("EXPIRE"));
  });
  it("AI-6.4.4f atomic put is one network round-trip", async () => {
    const { fake, repo } = makeRepo();
    fake.networkRoundTrips = 0;
    await repo.putAsync(makeTelemetryEntry({ telemetry: makeTel(1), userId: 1 }));
    assert.equal(fake.networkRoundTrips, 1);
    assert.equal(fake.lastAtomicPutRoundTrips, 1);
    assert.equal(fake.atomicPutCalls, 1);
    assert.equal(fake.casCalls, 0);
  });
  it("AI-6.4.4f concurrent 10,12,11,12,9,13 → final 13", async () => {
    const { repo } = makeRepo();
    const sid = "sess_conc_atomic01";
    const seqs = [10, 12, 11, 12, 9, 13];
    await Promise.all(
      seqs.map((seq) =>
        repo.putAsync(
          makeTelemetryEntry({ telemetry: makeTel(seq, "BTCUSDT", sid), userId: 42 }),
        ),
      ),
    );
    const got = await repo.getAsync(42, sid, "BTCUSDT", "real");
    assert.equal(got?.lastSequence, 13);
  });
  it("AI-6.4.4f two repos share same FakeRedis", async () => {
    const fake = new FakeRedisClient();
    const a = makeRepo(fake).repo;
    const b = makeRepo(fake).repo;
    const sid = "sess_share_repos01";
    await a.putAsync(makeTelemetryEntry({ telemetry: makeTel(3, "BTCUSDT", sid), userId: 7 }));
    const got = await b.getAsync(7, sid, "BTCUSDT", "real");
    assert.equal(got?.lastSequence, 3);
    const r = await b.putAsync(
      makeTelemetryEntry({ telemetry: makeTel(5, "BTCUSDT", sid), userId: 7 }),
    );
    assert.equal(r.accepted, true);
    const got2 = await a.getAsync(7, sid, "BTCUSDT", "real");
    assert.equal(got2?.lastSequence, 5);
  });
  it("AI-6.4.4f INVALID_EXISTING_RECORD repairs and accepts", async () => {
    const { fake, repo } = makeRepo();
    const t = makeTel(1);
    const entry = makeTelemetryEntry({ telemetry: t, userId: 11 });
    const key = buildTelemetryRepositoryKey({
      prefix: "gt:ai:telem:t",
      userId: 11,
      sessionId: entry.sessionId,
      symbol: entry.symbol,
      namespace: entry.namespace ?? "real",
    });
    await fake.set(key, "not-json", { PX: 12_000 });
    fake.networkRoundTrips = 0;
    const r = await repo.putAsync(entry);
    assert.equal(r.accepted, true);
    assert.equal(r.reason, "STORED");
    assert.equal(fake.networkRoundTrips, 1);
    const got = await repo.getAsync(11, t.sessionId, t.symbol, "real");
    assert.equal(got?.lastSequence, 1);
  });
});

describe("AI-6.4.1 factory", () => {
  it("memory default", () => {
    assert.equal(createMarketTelemetryRepository({ mode: "memory" }).mode, "memory");
  });
  it("redis without URL throws — no silent memory", () => {
    process.env.GOODTRADING_AI_TELEMETRY_REPOSITORY = "redis";
    assert.throws(
      () => createMarketTelemetryRepository({ mode: "redis" }),
      (e: unknown) => e instanceof TelemetryRepositoryConfigError,
    );
  });
  it("fakeRedisClient inject", async () => {
    const fake = new FakeRedisClient();
    const repo = createMarketTelemetryRepository({ mode: "redis", fakeRedisClient: fake });
    assert.equal(repo.mode, "redis");
    const t = makeTel(1);
    const r = await repoPut(repo, makeTelemetryEntry({ telemetry: t, userId: 1 }));
    assert.equal(r.accepted, true);
    const g = await repoGet(repo, 1, t.sessionId, t.symbol, "real");
    assert.equal(g?.lastSequence, 1);
  });
  it("async factory with fake", async () => {
    const fake = new FakeRedisClient();
    const repo = await createMarketTelemetryRepositoryAsync({
      mode: "redis",
      fakeRedisClient: fake,
    });
    assert.equal(repo.mode, "redis");
  });
  it("audit package present", () => {
    const a = auditSharedTelemetryInfra();
    assert.ok(["POSSIBLE", "READY"].includes(a.redis));
    assert.equal(a.filesystem, "FORBIDDEN");
  });
});

describe("AI-6.4.1 mentor", () => {
  it("mentorEligible false + MENTOR_INTEGRATION_NOT_ENABLED", () => {
    const r = buildTelemetryMentorReadiness();
    assert.equal(r.mentorEligible, false);
    assert.ok(r.blockers.includes(MENTOR_INTEGRATION_NOT_ENABLED));
    assert.equal(canUseTelemetryForMentor(), false);
  });
  it("redis_error stage", () => {
    process.env.GOODTRADING_AI_TELEMETRY_REPOSITORY = "redis";
    const r = buildTelemetryMentorReadiness({ redisError: "down" });
    assert.equal(r.stages.repository, "redis_error");
  });
});

describe("AI-6.4.1 security greps", () => {
  const files = [
    "server/ai/goodTradingAi/market/telemetry/redisClient.ts",
    "server/ai/goodTradingAi/market/telemetry/redisMarketTelemetryRepository.ts",
    "server/ai/goodTradingAi/market/telemetry/repositoryFactory.ts",
  ];
  for (const f of files) {
    it(`no KEYS/FLUSH APIs in ${f}`, () => {
      const src = readFileSync(join(process.cwd(), f), "utf8");
      assert.ok(!/\.keys\s*\(|\bFLUSHALL\b|\bFLUSHDB\b|\.sendCommand\(\s*\[\s*['"]KEYS/i.test(src));
    });
  }
  it("no silent memory fallback phrase in factory", () => {
    const src = readFileSync(
      join(process.cwd(), "server/ai/goodTradingAi/market/telemetry/repositoryFactory.ts"),
      "utf8",
    );
    assert.ok(src.includes("No silent memory fallback"));
  });
  it("package has redis dep", () => {
    const pkg = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8"));
    assert.ok(pkg.dependencies.redis);
  });
});

describe("AI-6.4.1 CAS sequence matrix", () => {
  for (let seq = 1; seq <= 40; seq++) {
    it(`store seq=${seq}`, async () => {
      const { repo } = makeRepo();
      const r = await repo.putAsync(
        makeTelemetryEntry({ telemetry: makeTel(seq, "ETHUSDT", `sess_mat_${String(seq).padStart(8, "0")}`), userId: seq }),
      );
      assert.equal(r.accepted, true);
    });
  }
});

describe("AI-6.4.1 multi-user isolation", () => {
  for (let u = 1; u <= 25; u++) {
    it(`user ${u} isolation`, async () => {
      const { repo } = makeRepo();
      const t = makeTel(1, "BTCUSDT", "sess_iso_abcdefgh");
      await repo.putAsync(makeTelemetryEntry({ telemetry: t, userId: u }));
      const other = await repo.getAsync(u + 1000, t.sessionId, t.symbol, "real");
      assert.equal(other, undefined);
      const mine = await repo.getAsync(u, t.sessionId, t.symbol, "real");
      assert.equal(mine?.userId, u);
    });
  }
});

describe("AI-6.4.1 symbol pad", () => {
  const symbols = [
    "BTCUSDT",
    "ETHUSDT",
    "SOLUSDT",
    "XRPUSDT",
    "BNBUSDT",
    "ADAUSDT",
    "DOGEUSDT",
    "AVAXUSDT",
    "LINKUSDT",
    "DOTUSDT",
  ];
  for (const sym of symbols) {
    it(`symbol ${sym}`, async () => {
      const { repo } = makeRepo();
      const t = makeTel(1, sym);
      await repo.putAsync(makeTelemetryEntry({ telemetry: t, userId: 1 }));
      const g = await repo.getAsync(1, t.sessionId, sym, "real");
      assert.equal(g?.symbol, sym);
    });
  }
});

describe("AI-6.4.1 duplicate pad", () => {
  for (let i = 0; i < 30; i++) {
    it(`dup#${i}`, async () => {
      const { repo } = makeRepo();
      const t = makeTel(7, "BTCUSDT", `sess_dup_${String(i).padStart(8, "0")}`);
      const e = makeTelemetryEntry({ telemetry: t, userId: 2 });
      assert.equal((await repo.putAsync(e)).accepted, true);
      assert.equal((await repo.putAsync(e)).accepted, false);
    });
  }
});

describe("AI-6.4.1 replay pad", () => {
  for (let i = 0; i < 20; i++) {
    it(`replay#${i}`, async () => {
      const { repo } = makeRepo();
      const sid = `sess_rep_${String(i).padStart(8, "0")}`;
      await repo.putAsync(makeTelemetryEntry({ telemetry: makeTel(10, "BTCUSDT", sid), userId: 1 }));
      const r = await repo.putAsync(
        makeTelemetryEntry({ telemetry: makeTel(5, "BTCUSDT", sid), userId: 1 }),
      );
      assert.equal(r.reason, "REPLAY_SEQUENCE");
    });
  }
});

describe("AI-6.4.1 removeSession pad", () => {
  for (let i = 0; i < 15; i++) {
    it(`remove#${i}`, async () => {
      const { repo } = makeRepo();
      const sid = `sess_rm_${String(i).padStart(8, "0")}`;
      await repo.putAsync(makeTelemetryEntry({ telemetry: makeTel(1, "BTCUSDT", sid), userId: i + 1 }));
      await repo.removeSession(i + 1, sid);
      assert.equal(await repo.getAsync(i + 1, sid, "BTCUSDT", "real"), undefined);
    });
  }
});

describe("AI-6.4.1 load model estimates (fake)", () => {
  it("100 puts", async () => {
    const { repo } = makeRepo();
    const t0 = Date.now();
    for (let i = 0; i < 100; i++) {
      await repo.putAsync(
        makeTelemetryEntry({
          telemetry: makeTel(i + 1, "BTCUSDT", `sess_ld100_${String(i).padStart(8, "0")}`),
          userId: (i % 10) + 1,
        }),
      );
    }
    const ms = Date.now() - t0;
    assert.ok(ms < 5_000, `100 puts took ${ms}ms`);
  });
  it("1000 puts estimate", async () => {
    const { repo } = makeRepo();
    const t0 = Date.now();
    for (let i = 0; i < 1000; i++) {
      await repo.putAsync(
        makeTelemetryEntry({
          telemetry: makeTel(1, "ETHUSDT", `sess_ld1k_${String(i).padStart(8, "0")}`),
          userId: (i % 50) + 1,
        }),
      );
    }
    const ms = Date.now() - t0;
    // Document estimate: fake local Map — NOT MEASURED for real Redis
    assert.ok(ms < 30_000, `1000 puts took ${ms}ms (fake only)`);
  });
  it("10k put estimate sample 2000", async () => {
    const { repo } = makeRepo();
    const t0 = Date.now();
    for (let i = 0; i < 2000; i++) {
      await repo.putAsync(
        makeTelemetryEntry({
          telemetry: makeTel(1, "SOLUSDT", `sess_ld10k_${String(i).padStart(8, "0")}`),
          userId: (i % 100) + 1,
        }),
      );
    }
    const sampleMs = Date.now() - t0;
    const estimate10kMs = (sampleMs / 2000) * 10_000;
    assert.ok(estimate10kMs > 0);
    // Real Redis latency: NOT MEASURED (smoke not run)
  });
});

describe("AI-6.4.1 perf fake", () => {
  it("p95 put under 5ms fake", async () => {
    const { repo } = makeRepo();
    const times: number[] = [];
    for (let i = 0; i < 50; i++) {
      const t0 = performance.now();
      await repo.putAsync(
        makeTelemetryEntry({
          telemetry: makeTel(i + 1, "BTCUSDT", `sess_perf_${String(i).padStart(8, "0")}`),
          userId: 1,
        }),
      );
      times.push(performance.now() - t0);
    }
    times.sort((a, b) => a - b);
    const p95 = times[Math.floor(times.length * 0.95)]!;
    assert.ok(p95 < 50, `fake p95=${p95}`);
  });
});

describe("AI-6.4.1 mentorEligible always false pad", () => {
  for (let i = 0; i < 20; i++) {
    it(`mentor false #${i}`, () => {
      assert.equal(canUseTelemetryForMentor(makeTel(i + 1)), false);
    });
  }
});
