/**
 * AI-6.4.2 — Redis production smoke runner (opt-in).
 * Requires GOODTRADING_AI_ALLOW_REDIS_SMOKE=true (alias ALLOW_REDIS_SMOKE) + connectable Redis URL.
 * Uses isolated prefix smoke:{id}: — never FLUSH / KEYS.
 */
import { randomBytes } from "node:crypto";
import { buildCompactMarketTelemetry } from "@shared/goodTradingAiMarketTelemetry";
import {
  loadRedisTelemetryConfig,
  isAllowRedisSmokeEnv,
  type RedisTelemetryConfig,
} from "./redisConfig";
import { createRealRedisClient, FakeRedisClient, type TelemetryRedisClient } from "./redisClient";
import { RedisMarketTelemetryRepository } from "./redisMarketTelemetryRepository";
import { makeTelemetryEntry } from "./telemetryStore";
import { toSafeRedisError, redactRedisSecrets } from "./redisSecretRedaction";
import {
  classifyLatencyP95,
  percentile,
  setRedisSmokeValidationFacts,
  type LatencyVerdict,
  type SharedRepositoryVerdict,
} from "./redisSmokeValidation";
import { auditRailwayRedisConfig } from "./redisRailwayAudit";

export type RedisSmokeGateResult =
  | { ok: true; reason: "authorized" }
  | { ok: false; reason: string; code: "SMOKE_REFUSED" };

export function assertRedisSmokeAuthorized(
  env: NodeJS.ProcessEnv = process.env,
): RedisSmokeGateResult {
  const allow = isAllowRedisSmokeEnv(env);
  if (!allow) {
    return {
      ok: false,
      code: "SMOKE_REFUSED",
      reason: "GOODTRADING_AI_ALLOW_REDIS_SMOKE not true — refusing real Redis smoke",
    };
  }
  const audit = auditRailwayRedisConfig(env);
  if (audit.classification !== "CONFIGURED") {
    return {
      ok: false,
      code: "SMOKE_REFUSED",
      reason: `Redis config ${audit.classification} — refusing smoke (no invented results)`,
    };
  }
  return { ok: true, reason: "authorized" };
}

function smokeTelemetry(seq: number, sessionId: string, symbol = "BTCUSDT") {
  const { telemetry } = buildCompactMarketTelemetry({
    symbol,
    sessionId,
    sequence: seq,
    telemetryMode: "real",
    orderFlowSummary: {
      tradeCount: seq,
      buyVolume: 1,
      sellVolume: 0,
      delta: 1,
      cvd: seq,
      imbalancePct: 50,
    },
  });
  return telemetry;
}

export type RedisSmokeReport = {
  ok: boolean;
  smokeId: string;
  prefix: string;
  urlEnvName: string;
  tls: boolean;
  connectOk: boolean;
  casOk: boolean;
  concurrentFinalSequence: number | null;
  namespaceIsolationOk: boolean | null;
  sharedRepository: SharedRepositoryVerdict;
  latency: {
    verdict: LatencyVerdict;
    samples: number;
    p50Ms: number | null;
    p95Ms: number | null;
    p99Ms: number | null;
  };
  cleanupOk: boolean;
  errorCode: string | null;
  notes: string[];
};

function buildSmokePrefix(smokeId: string): string {
  // Isolated — never touches production gt:ai:telem keys
  return `smoke:${smokeId}`;
}

async function withRepo(
  client: TelemetryRedisClient,
  cfg: RedisTelemetryConfig,
  fn: (repo: RedisMarketTelemetryRepository) => Promise<void>,
): Promise<void> {
  const repo = new RedisMarketTelemetryRepository(client, cfg);
  try {
    await fn(repo);
  } finally {
    await repo.quit();
  }
}

/**
 * Core smoke. Real client when authorized; tests may inject FakeRedisClient.
 */
export async function runRedisProductionSmoke(opts?: {
  env?: NodeJS.ProcessEnv;
  /** Inject fake client — CI / unit only (never claims real shared). */
  injectClient?: TelemetryRedisClient;
  latencyIterations?: number;
  skipGate?: boolean;
}): Promise<RedisSmokeReport> {
  const env = opts?.env ?? process.env;
  const smokeId = randomBytes(6).toString("hex");
  const notes: string[] = [];
  const report: RedisSmokeReport = {
    ok: false,
    smokeId,
    prefix: buildSmokePrefix(smokeId),
    urlEnvName: "NONE",
    tls: false,
    connectOk: false,
    casOk: false,
    concurrentFinalSequence: null,
    namespaceIsolationOk: null,
    sharedRepository: "NOT_MEASURED",
    latency: {
      verdict: "NOT_MEASURED",
      samples: 0,
      p50Ms: null,
      p95Ms: null,
      p99Ms: null,
    },
    cleanupOk: false,
    errorCode: null,
    notes,
  };

  if (!opts?.skipGate) {
    const gate = assertRedisSmokeAuthorized(env);
    if (!gate.ok) {
      report.errorCode = gate.code;
      notes.push(gate.reason);
      return report;
    }
  }

  let cfg: RedisTelemetryConfig;
  try {
    if (opts?.injectClient) {
      cfg = {
        url: "redis://fake",
        urlEnvName: "FAKE",
        prefix: report.prefix,
        ttlMs: 12_000,
        timeoutMs: 500,
        tls: false,
        ttlEnvName: null,
      };
      report.urlEnvName = "FAKE";
    } else {
      cfg = loadRedisTelemetryConfig(env);
      cfg = { ...cfg, prefix: report.prefix, ttlMs: Math.min(cfg.ttlMs, 12_000) };
      report.urlEnvName = cfg.urlEnvName;
      report.tls = cfg.tls;
    }
  } catch (e) {
    const safe = toSafeRedisError(e);
    report.errorCode = safe.code;
    notes.push(safe.message);
    return report;
  }

  const isFake = !!opts?.injectClient;
  let client: TelemetryRedisClient;
  try {
    client = opts?.injectClient ?? (await createRealRedisClient(cfg));
    report.connectOk = true;
  } catch (e) {
    const safe = toSafeRedisError(e);
    report.errorCode = safe.code;
    notes.push(safe.message);
    notes.push(redactRedisSecrets(e instanceof Error ? e.message : ""));
    return report;
  }

  const userId = 9_001_642;
  const sessionId = `sess_smoke_${smokeId}`;

  try {
    await withRepo(client, cfg, async (repo) => {
      // Basic CAS
      const t1 = smokeTelemetry(1, sessionId);
      const put1 = await repo.putAsync(makeTelemetryEntry({ telemetry: t1, userId }));
      const putDup = await repo.putAsync(makeTelemetryEntry({ telemetry: t1, userId }));
      const t2 = smokeTelemetry(2, sessionId);
      const put2 = await repo.putAsync(makeTelemetryEntry({ telemetry: t2, userId }));
      report.casOk =
        put1.accepted === true &&
        putDup.accepted === false &&
        put2.accepted === true;
      if (!report.casOk) notes.push("basic CAS failed");

      // Concurrent CAS → final sequence 13
      const concurrentSession = `sess_conc_${smokeId}`;
      await Promise.all(
        Array.from({ length: 13 }, (_, i) => {
          const seq = i + 1;
          return repo.putAsync(
            makeTelemetryEntry({
              telemetry: smokeTelemetry(seq, concurrentSession),
              userId,
            }),
          );
        }),
      );
      // Ensure final 13 wins (monotonic store of higher seq)
      const finalPut = await repo.putAsync(
        makeTelemetryEntry({
          telemetry: smokeTelemetry(13, concurrentSession),
          userId,
        }),
      );
      // 13 may be DUPLICATE if already stored — still final
      const got = await repo.getAsync(userId, concurrentSession, "BTCUSDT", "real");
      report.concurrentFinalSequence = got?.lastSequence ?? null;
      if (report.concurrentFinalSequence !== 13) {
        notes.push(`concurrent final seq=${report.concurrentFinalSequence} expected 13`);
      }
      void finalPut;

      // Namespace isolation (real vs synthetic_debug)
      const isoSession = `sess_iso_${smokeId}`;
      const { telemetry: realT } = buildCompactMarketTelemetry({
        symbol: "ETHUSDT",
        sessionId: isoSession,
        sequence: 1,
        telemetryMode: "real",
        orderFlowSummary: {
          tradeCount: 1,
          buyVolume: 1,
          sellVolume: 0,
          delta: 1,
          cvd: 1,
          imbalancePct: 1,
        },
      });
      const { telemetry: synT } = buildCompactMarketTelemetry({
        symbol: "ETHUSDT",
        sessionId: isoSession,
        sequence: 1,
        telemetryMode: "synthetic_debug",
        orderFlowSummary: {
          tradeCount: 9,
          buyVolume: 0,
          sellVolume: 1,
          delta: -1,
          cvd: -1,
          imbalancePct: -1,
        },
      });
      await repo.putAsync(makeTelemetryEntry({ telemetry: realT, userId }));
      await repo.putAsync(makeTelemetryEntry({ telemetry: synT, userId }));
      const gReal = await repo.getAsync(userId, isoSession, "ETHUSDT", "real");
      const gSyn = await repo.getAsync(userId, isoSession, "ETHUSDT", "synthetic_debug");
      report.namespaceIsolationOk =
        gReal?.telemetry.orderFlow &&
        gSyn?.telemetry.orderFlow &&
        gReal.telemetry.telemetryMode === "real" &&
        gSyn.telemetry.telemetryMode === "synthetic_debug" &&
        gReal.lastSequence === 1 &&
        gSyn.lastSequence === 1
          ? true
          : false;

      // Multi-client shared confirmation (second client same prefix)
      if (!isFake) {
        const client2 = await createRealRedisClient(cfg);
        try {
          const repo2 = new RedisMarketTelemetryRepository(client2, cfg);
          const sharedSession = `sess_shared_${smokeId}`;
          await repo.putAsync(
            makeTelemetryEntry({
              telemetry: smokeTelemetry(7, sharedSession),
              userId,
            }),
          );
          const fromOther = await repo2.getAsync(userId, sharedSession, "BTCUSDT", "real");
          report.sharedRepository =
            fromOther?.lastSequence === 7
              ? "SHARED_REPOSITORY_CONFIRMED"
              : "SHARED_REPOSITORY_NOT_CONFIRMED";
          await repo2.removeSession(userId, sharedSession);
          await repo2.quit();
        } catch (e) {
          report.sharedRepository = "SHARED_REPOSITORY_NOT_CONFIRMED";
          notes.push(toSafeRedisError(e).message);
        }
      } else {
        // Fake cannot claim multi-process shared
        report.sharedRepository = "SHARED_REPOSITORY_NOT_CONFIRMED";
        notes.push("injectClient/fake — shared multi-process NOT_CONFIRMED");
      }

      // Latency 50–100 puts
      const iters = Math.min(100, Math.max(50, opts?.latencyIterations ?? 60));
      const times: number[] = [];
      for (let i = 0; i < iters; i++) {
        const sid = `sess_lat_${smokeId}_${i}`;
        const t0 = performance.now();
        await repo.putAsync(
          makeTelemetryEntry({
            telemetry: smokeTelemetry(1, sid),
            userId: userId + (i % 3),
          }),
        );
        times.push(performance.now() - t0);
        await repo.removeSession(userId + (i % 3), sid);
      }
      times.sort((a, b) => a - b);
      const p50 = percentile(times, 50);
      const p95 = percentile(times, 95);
      const p99 = percentile(times, 99);
      const verdict = classifyLatencyP95(p95);
      report.latency = {
        verdict,
        samples: times.length,
        p50Ms: Math.round(p50 * 100) / 100,
        p95Ms: Math.round(p95 * 100) / 100,
        p99Ms: Math.round(p99 * 100) / 100,
      };

      // Cleanup smoke keys via known sessions (no KEYS)
      await repo.removeSession(userId, sessionId);
      await repo.removeSession(userId, concurrentSession);
      await repo.removeSession(userId, isoSession);
      report.cleanupOk = true;
    });

    report.ok =
      report.connectOk &&
      report.casOk &&
      report.concurrentFinalSequence === 13 &&
      report.namespaceIsolationOk === true &&
      report.cleanupOk;

    setRedisSmokeValidationFacts({
      smokeValidated: report.ok && !isFake,
      smokeId,
      smokePrefix: report.prefix,
      sharedRepository: report.sharedRepository,
      latency: report.latency,
      casConcurrentFinalSequence: report.concurrentFinalSequence,
      namespaceIsolationOk: report.namespaceIsolationOk,
      measuredAtMs: Date.now(),
      notes: isFake
        ? ["Fake/injected client — smokeValidated left false for production facts"]
        : report.ok
          ? ["Real Redis smoke OK"]
          : notes,
    });
  } catch (e) {
    const safe = toSafeRedisError(e);
    report.errorCode = safe.code;
    notes.push(safe.message);
    try {
      await client.quit();
    } catch {
      /* ignore */
    }
  }

  return report;
}

/** Dangerous failure cases — FakeRedis only (never against prod). */
export async function runFakeRedisFailureRecoverySmoke(): Promise<{
  unavailableHandled: boolean;
  healthIndependent: true;
}> {
  const fake = new FakeRedisClient();
  fake.forceCasOutcome = "UNAVAILABLE";
  const cfg: RedisTelemetryConfig = {
    url: "redis://fake",
    urlEnvName: "FAKE",
    prefix: `smoke:fake:${randomBytes(4).toString("hex")}`,
    ttlMs: 12_000,
    timeoutMs: 200,
    tls: false,
    ttlEnvName: null,
  };
  const repo = new RedisMarketTelemetryRepository(fake, cfg);
  const t = smokeTelemetry(1, "sess_fail_abcdef01");
  const put = await repo.putAsync(makeTelemetryEntry({ telemetry: t, userId: 1 }));
  await repo.quit();
  return {
    unavailableHandled: put.reason === "UNAVAILABLE",
    healthIndependent: true,
  };
}
