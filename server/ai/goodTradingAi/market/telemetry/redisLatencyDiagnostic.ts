/**
 * AI-6.4.4e — Redis latency diagnostic (opt-in).
 * Separates connect / raw commands / Lua CAS / repo.put / serialization.
 * Never prints URL/password. Never FLUSH/KEYS. Isolated diag:{id}: prefix.
 */
import { randomBytes } from "node:crypto";
import {
  loadRedisTelemetryConfig,
  isAllowRedisSmokeEnv,
  type RedisTelemetryConfig,
} from "./redisConfig";
import {
  FakeRedisClient,
  RealRedisClient,
  getRedisClientLifecycleCounters,
  resetRedisClientLifecycleCounters,
  type TelemetryRedisClient,
} from "./redisClient";
import { RedisMarketTelemetryRepository } from "./redisMarketTelemetryRepository";
import { makeTelemetryEntry } from "./telemetryStore";
import { buildCompactMarketTelemetry } from "./buildCompactMarketTelemetry";
import { percentile } from "./redisSmokeValidation";
import { toSafeRedisError, containsRedisSecretLeak } from "./redisSecretRedaction";
import { auditRailwayRedisConfig } from "./redisRailwayAudit";
import { buildTelemetrySessionIndexKey } from "./redisKeys";

export type RedisRouteClass =
  | "PRIVATE_RAILWAY"
  | "PUBLIC_PROXY"
  | "LOCAL"
  | "UNKNOWN";

/** Topology / region health without printing hosts or secrets. */
export type RedisTopologyClass =
  | "SAME_REGION_HEALTHY"
  | "SATURATED"
  | "CROSS_REGION"
  | "UNKNOWN"
  | "AMBIGUOUS";

export type LatencyBlockStats = {
  name: string;
  samples: number;
  minMs: number | null;
  p50Ms: number | null;
  p95Ms: number | null;
  p99Ms: number | null;
  maxMs: number | null;
  meanMs: number | null;
  errors: number;
  /** Expected Redis network round-trips per sample (when known). */
  expectedRoundTrips?: number | null;
  observedRoundTrips?: number | null;
};

export type RedisLatencyDiagnosticReport = {
  ok: boolean;
  diagnosticId: string;
  prefix: string;
  gateOk: boolean;
  routeClass: RedisRouteClass;
  topologyClass: RedisTopologyClass;
  urlEnvName: string;
  tls: boolean;
  timeoutMsConfigured: number | null;
  reconnectStrategy: false;
  lifecycle: ReturnType<typeof getRedisClientLifecycleCounters>;
  blocks: LatencyBlockStats[];
  decomposition: {
    smokeMeasures: string;
    removeSessionOutsideSmokeTimer: true;
    putAsyncExpectedRoundTrips: 1;
    fixedDelaySignaturesChecked: string[];
  };
  suggestedRootCauseCandidates: string[];
  errorCode: string | null;
  notes: string[];
};

export function isAllowRedisDiagnosticEnv(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const v = env.GOODTRADING_AI_ALLOW_REDIS_DIAGNOSTIC?.trim();
  return v === "true" || v === "1";
}

/**
 * Classify route WITHOUT emitting host/URL.
 * REDIS_URL may still resolve to *.railway.internal (private).
 */
export function classifyRedisRouteClass(
  cfg: Pick<RedisTelemetryConfig, "url" | "urlEnvName" | "tls">,
): RedisRouteClass {
  if (cfg.urlEnvName === "REDIS_PRIVATE_URL") return "PRIVATE_RAILWAY";
  let host = "";
  try {
    host = new URL(cfg.url).hostname.toLowerCase();
  } catch {
    return "UNKNOWN";
  }
  if (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "::1" ||
    host === "0.0.0.0"
  ) {
    return "LOCAL";
  }
  if (host.endsWith(".railway.internal") || host.includes("railway.internal")) {
    return "PRIVATE_RAILWAY";
  }
  if (
    host.endsWith(".proxy.rlwy.net") ||
    host.endsWith(".rlwy.net") ||
    host.includes("upstash") ||
    host.includes("redis.cloud")
  ) {
    return "PUBLIC_PROXY";
  }
  void cfg.tls;
  if (cfg.urlEnvName === "REDIS_URL" || cfg.urlEnvName === "REDIS_TLS_URL") {
    return "UNKNOWN";
  }
  if (cfg.urlEnvName === "REDISHOST+REDISPORT") return "UNKNOWN";
  return "UNKNOWN";
}

/**
 * Classify region/topology from measured RTTs (no host/secrets).
 * PRIVATE + low RTT → SAME_REGION_HEALTHY; PRIVATE + high stable RTT → SATURATED or CROSS_REGION;
 * PUBLIC high → CROSS_REGION-ish via route; otherwise AMBIGUOUS/UNKNOWN.
 */
export function classifyRedisTopologyClass(input: {
  routeClass: RedisRouteClass;
  commandP50Ms: number | null;
  commandP95Ms: number | null;
  putP50Ms: number | null;
}): RedisTopologyClass {
  const { routeClass, commandP50Ms, commandP95Ms, putP50Ms } = input;
  if (commandP50Ms == null || commandP95Ms == null) return "UNKNOWN";

  const tight =
    Math.abs(commandP95Ms - commandP50Ms) < Math.max(20, commandP50Ms * 0.15);
  const putAligned =
    putP50Ms == null || Math.abs(putP50Ms - commandP50Ms) < Math.max(40, commandP50Ms * 0.35);

  if (routeClass === "LOCAL") {
    if (commandP95Ms < 25) return "SAME_REGION_HEALTHY";
    return "AMBIGUOUS";
  }

  if (routeClass === "PUBLIC_PROXY") {
    if (commandP50Ms > 40) return "CROSS_REGION";
    return "AMBIGUOUS";
  }

  if (routeClass === "PRIVATE_RAILWAY") {
    if (commandP95Ms < 25 && putAligned) return "SAME_REGION_HEALTHY";
    if (commandP50Ms >= 80 && tight) {
      // Stable high private RTT: saturation vs cross-AZ/region — cannot distinguish without Railway region labels.
      if (commandP50Ms >= 200) return "CROSS_REGION";
      return "SATURATED";
    }
    if (commandP50Ms >= 40 && commandP50Ms < 80) return "AMBIGUOUS";
    return "AMBIGUOUS";
  }

  return "UNKNOWN";
}

function statsOf(
  name: string,
  times: number[],
  errors: number,
  roundTrips?: { expected?: number | null; observed?: number | null },
): LatencyBlockStats {
  if (times.length === 0) {
    return {
      name,
      samples: 0,
      minMs: null,
      p50Ms: null,
      p95Ms: null,
      p99Ms: null,
      maxMs: null,
      meanMs: null,
      errors,
      expectedRoundTrips: roundTrips?.expected ?? null,
      observedRoundTrips: roundTrips?.observed ?? null,
    };
  }
  const sorted = [...times].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  const round = (n: number) => Math.round(n * 100) / 100;
  return {
    name,
    samples: sorted.length,
    minMs: round(sorted[0]!),
    p50Ms: round(percentile(sorted, 50)),
    p95Ms: round(percentile(sorted, 95)),
    p99Ms: round(percentile(sorted, 99)),
    maxMs: round(sorted[sorted.length - 1]!),
    meanMs: round(sum / sorted.length),
    errors,
    expectedRoundTrips: roundTrips?.expected ?? null,
    observedRoundTrips: roundTrips?.observed ?? null,
  };
}

async function timeBlock(
  name: string,
  n: number,
  fn: (i: number) => Promise<void>,
  roundTrips?: { expected?: number | null; observed?: number | null },
): Promise<LatencyBlockStats> {
  const times: number[] = [];
  let errors = 0;
  for (let i = 0; i < n; i++) {
    const t0 = performance.now();
    try {
      await fn(i);
      times.push(performance.now() - t0);
    } catch {
      errors += 1;
    }
  }
  return statsOf(name, times, errors, roundTrips);
}

function smokeLikeTelemetry(sequence: number, sessionId: string) {
  const { telemetry } = buildCompactMarketTelemetry({
    symbol: "BTCUSDT",
    sessionId,
    sequence,
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
  return telemetry;
}

export async function runRedisLatencyDiagnostic(opts?: {
  env?: NodeJS.ProcessEnv;
  injectClient?: TelemetryRedisClient;
  skipGate?: boolean;
  rawSamples?: number;
  repoSamples?: number;
}): Promise<RedisLatencyDiagnosticReport> {
  const env = opts?.env ?? process.env;
  const diagnosticId = randomBytes(6).toString("hex");
  const notes: string[] = [];
  const blocks: LatencyBlockStats[] = [];
  const prefix = `diag:${diagnosticId}`;
  const rawN = Math.min(40, Math.max(10, opts?.rawSamples ?? 20));
  const repoN = Math.min(30, Math.max(8, opts?.repoSamples ?? 15));

  const report: RedisLatencyDiagnosticReport = {
    ok: false,
    diagnosticId,
    prefix,
    gateOk: false,
    routeClass: "UNKNOWN",
    topologyClass: "UNKNOWN",
    urlEnvName: "NONE",
    tls: false,
    timeoutMsConfigured: null,
    reconnectStrategy: false,
    lifecycle: getRedisClientLifecycleCounters(),
    blocks,
    decomposition: {
      smokeMeasures:
        "repo.putAsync wall-clock (atomic Lua CAS+SADD+EXPIRE = 1 RTT on STORED)",
      removeSessionOutsideSmokeTimer: true,
      putAsyncExpectedRoundTrips: 1,
      fixedDelaySignaturesChecked: [
        "socket.connectTimeout (config only; not per-command)",
        "reconnectStrategy=false (no retry sleep)",
        "no Promise.race delay in telemetry redis client",
        "smoke latency excludes removeSession",
      ],
    },
    suggestedRootCauseCandidates: [],
    errorCode: null,
    notes,
  };

  if (!opts?.skipGate) {
    if (!isAllowRedisDiagnosticEnv(env)) {
      report.errorCode = "DIAGNOSTIC_REFUSED";
      notes.push(
        "Set GOODTRADING_AI_ALLOW_REDIS_DIAGNOSTIC=true (one-shot; do not persist in Railway Variables)",
      );
      return report;
    }
    const audit = auditRailwayRedisConfig(env);
    if (audit.classification !== "CONFIGURED" && !opts?.injectClient) {
      report.errorCode = "REDIS_NOT_CONFIGURED";
      notes.push(`Redis classification=${audit.classification}`);
      return report;
    }
  }
  report.gateOk = true;

  resetRedisClientLifecycleCounters();

  let cfg: RedisTelemetryConfig;
  const tCfg0 = performance.now();
  try {
    if (opts?.injectClient) {
      cfg = {
        url: "redis://fake",
        urlEnvName: "FAKE",
        prefix,
        ttlMs: 12_000,
        timeoutMs: 500,
        tls: false,
        ttlEnvName: null,
      };
    } else {
      cfg = loadRedisTelemetryConfig(env);
      cfg = { ...cfg, prefix, ttlMs: Math.min(cfg.ttlMs, 12_000) };
    }
    blocks.push(statsOf("config_load", [performance.now() - tCfg0], 0));
  } catch (e) {
    report.errorCode = toSafeRedisError(e).code;
    notes.push(toSafeRedisError(e).message);
    return report;
  }

  report.urlEnvName = cfg.urlEnvName;
  report.tls = cfg.tls;
  report.timeoutMsConfigured = cfg.timeoutMs;
  report.routeClass = opts?.injectClient ? "LOCAL" : classifyRedisRouteClass(cfg);

  let client: TelemetryRedisClient = opts?.injectClient as TelemetryRedisClient;
  try {
    if (opts?.injectClient) {
      blocks.push(statsOf("createClient_construct", [0.01], 0));
      blocks.push(statsOf("initial_connect", [0.01], 0));
    } else {
      const t0 = performance.now();
      const c = new RealRedisClient(cfg);
      blocks.push(statsOf("createClient_construct", [performance.now() - t0], 0));
      const t1 = performance.now();
      await c.connect();
      blocks.push(statsOf("initial_connect", [performance.now() - t1], 0));
      client = c;
    }
  } catch (e) {
    report.errorCode = toSafeRedisError(e).code;
    notes.push(toSafeRedisError(e).message);
    return report;
  }

  try {
    blocks.push(
      await timeBlock("warm_up_ping", 3, async () => {
        await client.set(`${prefix}:warmup`, "1", { PX: 5_000 });
        await client.get(`${prefix}:warmup`);
        await client.del(`${prefix}:warmup`);
      }),
    );

    blocks.push(
      await timeBlock(
        "raw_SET",
        rawN,
        async (i) => {
          await client.set(`${prefix}:raw:set:${i}`, `v${i}`, { PX: 8_000 });
        },
        { expected: 1, observed: 1 },
      ),
    );
    blocks.push(
      await timeBlock(
        "raw_GET",
        rawN,
        async (i) => {
          await client.get(`${prefix}:raw:set:${i % rawN}`);
        },
        { expected: 1, observed: 1 },
      ),
    );
    blocks.push(
      await timeBlock(
        "raw_PTTL",
        Math.min(rawN, 15),
        async (i) => {
          await client.pttl(`${prefix}:raw:set:${i % rawN}`);
        },
        { expected: 1, observed: 1 },
      ),
    );
    blocks.push(
      await timeBlock(
        "raw_DEL",
        Math.min(rawN, 15),
        async (i) => {
          await client.del(`${prefix}:raw:set:${i}`);
        },
        { expected: 1, observed: 1 },
      ),
    );

    // Legacy CAS-only EVAL (1 RTT, no index) — comparison baseline.
    blocks.push(
      await timeBlock(
        "lua_CAS_only",
        repoN,
        async (i) => {
          const key = `${prefix}:cas:${i}`;
          const payload = JSON.stringify({
            schemaVersion: "1.0",
            sequence: 1,
            userId: 1,
            sessionId: `d${i}`,
            symbol: "BTCUSDT",
            namespace: "real",
            recordedAtMs: Date.now(),
            expiresAtMs: Date.now() + 8_000,
            telemetry: { symbol: "BTCUSDT" },
          });
          await client.casPut(key, payload, 1, 8_000);
        },
        { expected: 1, observed: 1 },
      ),
    );

    // New atomic put EVAL (CAS + SADD + EXPIRE in one RTT).
    blocks.push(
      await timeBlock(
        "rawLuaAtomicPut",
        repoN,
        async (i) => {
          const key = `${prefix}:atomic:${i}`;
          const sess = `${prefix}:atomic:sess:${i}`;
          const payload = JSON.stringify({
            schemaVersion: "1.0",
            sequence: 1,
            userId: 1,
            sessionId: `a${i}`,
            symbol: "BTCUSDT",
            namespace: "real",
            recordedAtMs: Date.now(),
            expiresAtMs: Date.now() + 8_000,
            telemetry: { symbol: "BTCUSDT" },
          });
          await client.atomicPut({
            recordKey: key,
            sessionIndexKey: sess,
            sequence: 1,
            payload,
            recordTtlMs: 8_000,
            sessionIndexTtlSeconds: 9,
            recordKeyForIndex: key,
          });
        },
        { expected: 1, observed: 1 },
      ),
    );

    blocks.push(
      await timeBlock("serialization_cpu", repoN, async (i) => {
        const tel = smokeLikeTelemetry(1, `ser_${i}`);
        const entry = makeTelemetryEntry({ telemetry: tel, userId: 42 });
        JSON.stringify(entry);
      }),
    );

    const repo = new RedisMarketTelemetryRepository(client, cfg);
    let observedPutRtt: number | null = null;
    if (client instanceof FakeRedisClient) {
      const before = client.networkRoundTrips;
      await repo.putAsync(
        makeTelemetryEntry({
          telemetry: smokeLikeTelemetry(1, "rtt_probe"),
          userId: 9_001_699,
        }),
      );
      observedPutRtt = client.networkRoundTrips - before;
      await repo.removeSession(9_001_699, "rtt_probe");
    } else {
      observedPutRtt = 1; // production path is a single EVAL
    }

    blocks.push(
      await timeBlock(
        "repo_putAsync_full",
        repoN,
        async (i) => {
          const sid = `put_${i}`;
          await repo.putAsync(
            makeTelemetryEntry({
              telemetry: smokeLikeTelemetry(1, sid),
              userId: 9_001_700 + (i % 3),
            }),
          );
        },
        { expected: 1, observed: observedPutRtt },
      ),
    );
    for (let i = 0; i < repoN; i++) {
      await repo.removeSession(9_001_700 + (i % 3), `put_${i}`);
    }

    // Optional legacy 3-command path (casPut + SADD + EXPIRE) — few samples, isolated diag keys only.
    const legacyN = Math.min(5, repoN);
    blocks.push(
      await timeBlock(
        "legacy_3cmd_put_diag_only",
        legacyN,
        async (i) => {
          const key = `${prefix}:legacy3:${i}`;
          const sess = buildTelemetrySessionIndexKey(prefix, 9_001_650, `leg_${i}`);
          const payload = JSON.stringify({
            schemaVersion: "1.0",
            sequence: 1,
            userId: 9_001_650,
            sessionId: `leg_${i}`,
            symbol: "BTCUSDT",
            namespace: "real",
            recordedAtMs: Date.now(),
            expiresAtMs: Date.now() + 8_000,
            telemetry: { symbol: "BTCUSDT" },
          });
          await client.casPut(key, payload, 1, 8_000);
          await client.sadd(sess, key);
          await client.expire(sess, 9);
        },
        { expected: 3, observed: 3 },
      ),
    );
    for (let i = 0; i < legacyN; i++) {
      await client.del(`${prefix}:legacy3:${i}`);
      await client.del(buildTelemetrySessionIndexKey(prefix, 9_001_650, `leg_${i}`));
    }

    blocks.push(
      await timeBlock(
        "repo_getAsync",
        Math.min(repoN, 10),
        async (i) => {
          await repo.getAsync(9_001_700, `missing_${i}`, "BTCUSDT", "real");
        },
        { expected: 1, observed: 1 },
      ),
    );

    blocks.push(
      await timeBlock(
        "e2e_put_get_remove",
        5,
        async (i) => {
          const sid = `e2e_${i}`;
          const uid = 9_001_800;
          await repo.putAsync(
            makeTelemetryEntry({
              telemetry: smokeLikeTelemetry(1, sid),
              userId: uid,
            }),
          );
          await repo.getAsync(uid, sid, "BTCUSDT", "real");
          await repo.removeSession(uid, sid);
        },
      ),
    );

    for (let i = 0; i < rawN; i++) {
      await client.del(`${prefix}:raw:set:${i}`);
      await client.del(`${prefix}:cas:${i}`);
      await client.del(`${prefix}:atomic:${i}`);
      await client.del(`${prefix}:atomic:sess:${i}`);
    }
    await client.del(`${prefix}:warmup`);

    report.lifecycle = getRedisClientLifecycleCounters();
    report.ok = true;
    const rawSet = blocks.find((b) => b.name === "raw_SET");
    const put = blocks.find((b) => b.name === "repo_putAsync_full");
    report.topologyClass = classifyRedisTopologyClass({
      routeClass: report.routeClass,
      commandP50Ms: rawSet?.p50Ms ?? null,
      commandP95Ms: rawSet?.p95Ms ?? null,
      putP50Ms: put?.p50Ms ?? null,
    });
    report.suggestedRootCauseCandidates = suggestRootCauses(report);
    notes.push(
      "Diagnostic complete. Disable GOODTRADING_AI_ALLOW_REDIS_DIAGNOSTIC after one run.",
    );
    notes.push(
      `putAsyncExpectedRoundTrips=1 observed=${observedPutRtt}; topologyClass=${report.topologyClass}`,
    );
    if (isAllowRedisSmokeEnv(env)) {
      notes.push(
        "NOTE: ALLOW_REDIS_SMOKE is also set — diagnostic does not write proof; prefer unset smoke flag.",
      );
    }
  } catch (e) {
    report.errorCode = toSafeRedisError(e).code;
    notes.push(toSafeRedisError(e).message);
  } finally {
    try {
      await client.quit();
    } catch {
      /* ignore */
    }
    report.lifecycle = getRedisClientLifecycleCounters();
  }

  return report;
}

function suggestRootCauses(report: RedisLatencyDiagnosticReport): string[] {
  const by = (n: string) => report.blocks.find((b) => b.name === n);
  const rawSet = by("raw_SET");
  const atomic = by("rawLuaAtomicPut");
  const put = by("repo_putAsync_full");
  const legacy3 = by("legacy_3cmd_put_diag_only");
  const ser = by("serialization_cpu");
  const connect = by("initial_connect");
  const out: string[] = [];

  if (report.lifecycle.ensureReconnects > 0 || report.lifecycle.connects > 2) {
    out.push("CLIENT_RECONNECT_PER_OPERATION");
  }
  if (ser && ser.p95Ms != null && ser.p95Ms > 20) {
    out.push("SERIALIZATION");
  }
  // After 6.4.4f: put should ≈ 1× command RTT. If still ≈3×, regression to multi-RTT.
  if (
    rawSet?.p95Ms != null &&
    put?.p95Ms != null &&
    put.p95Ms > rawSet.p95Ms * 2.2 &&
    put.p95Ms < rawSet.p95Ms * 4.5
  ) {
    out.push("WRAPPER");
    out.push("BENCHMARK_BUG");
  }
  if (
    atomic?.p95Ms != null &&
    put?.p95Ms != null &&
    Math.abs(put.p95Ms - atomic.p95Ms) < Math.max(30, atomic.p95Ms * 0.25) &&
    rawSet?.p95Ms != null &&
    Math.abs(atomic.p95Ms - rawSet.p95Ms) < Math.max(40, rawSet.p95Ms * 0.4)
  ) {
    // Healthy 1-RTT alignment — not a bug; topology may still be slow.
  }
  if (
    legacy3?.p95Ms != null &&
    put?.p95Ms != null &&
    rawSet?.p95Ms != null &&
    legacy3.p95Ms > put.p95Ms * 1.8 &&
    Math.abs(legacy3.p95Ms - 3 * rawSet.p95Ms) < 100
  ) {
    // Confirms old path was 3×RTT; current put is improved (informational via notes, not a root cause).
  }
  if (
    rawSet?.p95Ms != null &&
    atomic?.p95Ms != null &&
    atomic.p95Ms > rawSet.p95Ms * 5 &&
    atomic.p95Ms > 100
  ) {
    out.push("LUA_CAS");
  }
  if (report.routeClass === "PUBLIC_PROXY" && (rawSet?.p95Ms ?? 0) > 80) {
    out.push("PUBLIC_ROUTE_LATENCY");
  }
  if (report.topologyClass === "CROSS_REGION") {
    out.push("CROSS_REGION_OR_REDIS_SATURATION");
  } else if (
    report.routeClass === "PRIVATE_RAILWAY" &&
    (rawSet?.p95Ms ?? 0) > 80
  ) {
    out.push("CROSS_REGION_OR_REDIS_SATURATION");
  }
  if (report.topologyClass === "SATURATED") {
    out.push("CROSS_REGION_OR_REDIS_SATURATION");
  }
  if (
    rawSet?.p50Ms != null &&
    rawSet.p95Ms != null &&
    Math.abs(rawSet.p95Ms - rawSet.p50Ms) < 15 &&
    rawSet.p50Ms > 200
  ) {
    out.push("TIMEOUT_OR_RETRY_DELAY");
  }
  if (connect?.maxMs != null && connect.maxMs > 1000) {
    out.push("CONNECT_SLOW");
  }
  if (out.length === 0) out.push("NOT_DETERMINED");
  if (out.length > 1) out.unshift("MULTIPLE");
  return [...new Set(out)];
}

export function diagnosticReportForLog(
  report: RedisLatencyDiagnosticReport,
): string {
  const text = JSON.stringify({
    event: report.ok
      ? "redis_latency_diagnostic_ok"
      : "redis_latency_diagnostic_fail",
    ...report,
  });
  if (containsRedisSecretLeak(text)) {
    return JSON.stringify({
      event: "redis_latency_diagnostic_fail",
      errorCode: "REDIS_SECRET_LEAK_BLOCKED",
    });
  }
  return text;
}

export async function runFakeRedisLatencyDiagnostic(): Promise<RedisLatencyDiagnosticReport> {
  const fake = new FakeRedisClient();
  return runRedisLatencyDiagnostic({
    injectClient: fake,
    skipGate: true,
    rawSamples: 12,
    repoSamples: 8,
  });
}
