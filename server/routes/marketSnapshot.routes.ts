/**
 * Market Snapshot routes — admin/internal (AI-6 / 6.1 / 6.2).
 * No new WebSockets. No Mentor/OpenAI wiring.
 */
import type { Express, Request, Response } from "express";
import { simulateMarketInputSchema } from "@shared/goodTradingAiMarket";
import {
  telemetryIngestRequestSchema,
  TELEMETRY_MAX_BYTES,
  estimateTelemetryBytes,
} from "@shared/goodTradingAiMarketTelemetry";
import { requireMarketSnapshotAccess } from "../ai/goodTradingAi/market/access";
import { marketSnapshotRateLimit } from "../ai/goodTradingAi/market/rateLimit";
import {
  isGoodTradingAiMarketLiveEnabled,
  isGoodTradingAiMarketSnapshotEnabled,
  isGoodTradingAiMarketTelemetryAutoPublishInternal,
  isGoodTradingAiMarketTelemetryEnabled,
  getGoodTradingAiTelemetryRepositoryMode,
} from "../ai/goodTradingAi/market/features";
import {
  getMarketTelemetryStore,
  makeTelemetryEntry,
  logTelemetryObs,
  auditRailwayTelemetryTopology,
  canUseTelemetryForMentor,
  auditSharedTelemetryInfra,
  tryCreateConfiguredTelemetryRepository,
  buildTelemetryMentorReadiness,
  repoPut,
  repoGet,
} from "../ai/goodTradingAi/market/telemetry";
import {
  loadRedisTelemetryConfig,
  redactRedisConfigForStatus,
  RedisTelemetryConfigError,
} from "../ai/goodTradingAi/market/telemetry/redisConfig";
import { auditRailwayRedisConfig } from "../ai/goodTradingAi/market/telemetry/redisRailwayAudit";
import { redisSmokeFactsForStatus } from "../ai/goodTradingAi/market/telemetry/redisSmokeValidation";
import { toSafeRedisError } from "../ai/goodTradingAi/market/telemetry/redisSecretRedaction";
import { auditRailwayRedisProvisioning } from "../ai/goodTradingAi/market/telemetry/redisProvisioningAudit";
import {
  loadRedisValidationProofForStatus,
  redisValidationProofForStatus,
} from "../ai/goodTradingAi/market/telemetry/redisValidationProof";
import {
  buildSimulatedSnapshot,
  buildStubSnapshot,
  toAdminPayload,
} from "../ai/goodTradingAi/market/marketSnapshot";
import {
  buildLiveInternalSnapshot,
  getMarketSourceCapabilities,
} from "../ai/goodTradingAi/market/live";

function userOf(req: Request) {
  return req.saasUser ?? req.user;
}

export function registerMarketSnapshotRoutes(app: Express): void {
  const base = "/api/internal/ai/market";
  const guards = [requireMarketSnapshotAccess, marketSnapshotRateLimit];

  app.get(`${base}/status`, ...guards, async (_req: Request, res: Response) => {
    const store = getMarketTelemetryStore();
    const repoMode = getGoodTradingAiTelemetryRepositoryMode();
    const railway = auditRailwayTelemetryTopology({
      repositoryMode: repoMode,
    });
    const sharedAudit = auditSharedTelemetryInfra();
    const railwayRedis = auditRailwayRedisConfig();
    const processSmoke = redisSmokeFactsForStatus();
    let persistentProofStatus = redisValidationProofForStatus(null);
    try {
      const proof = await loadRedisValidationProofForStatus();
      persistentProofStatus = redisValidationProofForStatus(proof);
    } catch {
      /* status must not fail if Redis proof unread */
    }
    // Prefer persistent proof over process-local facts (survives redeploy)
    const smokeFacts = {
      ...processSmoke,
      smokeValidated: persistentProofStatus.smokeValidated || processSmoke.smokeValidated,
      sharedRepository: persistentProofStatus.proofPresent
        ? persistentProofStatus.sharedRepository
        : processSmoke.sharedRepository,
      latencyVerdict: persistentProofStatus.proofPresent
        ? persistentProofStatus.performanceVerdict
        : processSmoke.latencyVerdict,
      correctnessVerdict: persistentProofStatus.proofPresent
        ? persistentProofStatus.correctnessVerdict
        : processSmoke.correctnessVerdict,
      performanceVerdict: persistentProofStatus.proofPresent
        ? persistentProofStatus.performanceVerdict
        : processSmoke.performanceVerdict,
      validationStatus: persistentProofStatus.proofPresent
        ? persistentProofStatus.validationStatus
        : processSmoke.validationStatus,
      performancePassed: persistentProofStatus.proofPresent
        ? persistentProofStatus.performancePassed
        : processSmoke.performancePassed,
      latencyP50Ms: persistentProofStatus.proofPresent
        ? persistentProofStatus.latencyP50Ms
        : processSmoke.latencyP50Ms,
      latencyP95Ms: persistentProofStatus.proofPresent
        ? persistentProofStatus.latencyP95Ms
        : processSmoke.latencyP95Ms,
      latencyP99Ms: persistentProofStatus.proofPresent
        ? persistentProofStatus.latencyP99Ms
        : processSmoke.latencyP99Ms,
      measuredAtMs: persistentProofStatus.validatedAtMs ?? processSmoke.measuredAtMs,
      smokeId: processSmoke.smokeValidated ? processSmoke.smokeId : null,
      proof: persistentProofStatus,
    };
    const provisioning = auditRailwayRedisProvisioning({
      railwayCliPresent: false,
    });
    let redisError: string | undefined;
    let redisCfgRedacted = redactRedisConfigForStatus(null);
    if (repoMode === "redis") {
      try {
        redisCfgRedacted = redactRedisConfigForStatus(loadRedisTelemetryConfig());
      } catch (e) {
        const safe = toSafeRedisError(e);
        redisError =
          e instanceof RedisTelemetryConfigError
            ? e.message
            : `${safe.message} (${safe.code})`;
      }
      if (!sharedAudit.canImplementSharedSafely && !redisError) {
        redisError = sharedAudit.multiInstanceBlocker ?? "redis blocked";
      }
    }
    const readiness = buildTelemetryMentorReadiness({
      redisError,
      smokeValidated: smokeFacts.smokeValidated,
      proofStatus: persistentProofStatus,
    });
    res.json({
      enabled: isGoodTradingAiMarketSnapshotEnabled(),
      liveEnabled: isGoodTradingAiMarketLiveEnabled(),
      telemetryEnabled: isGoodTradingAiMarketTelemetryEnabled(),
      autoPublishInternal: isGoodTradingAiMarketTelemetryAutoPublishInternal(),
      liveProviders: isGoodTradingAiMarketLiveEnabled(),
      repositoryMode: repoMode === "redis" ? "redis" : store.stats().mode,
      repositoryConfigured: repoMode,
      repositorySafety: railway.repositorySafety,
      replicaTopology: railway.topology,
      redisDiscovered: railway.redisDiscovered,
      postgresDiscovered: railway.postgresDiscovered,
      redis: redisCfgRedacted,
      redisConfigClassification: railwayRedis.classification,
      redisProposedRailwaySteps: railwayRedis.proposedRailwaySteps,
      redisProvisioning: {
        classification: provisioning.classification,
        stoppedForHumanConfig: provisioning.stoppedForHumanConfig,
        stopReason: provisioning.stopReason,
        humanRunbook: provisioning.humanRunbook,
        proposedVarNames: provisioning.proposedVarNames,
        evidence: provisioning.evidence,
      },
      redisSmoke: smokeFacts,
      redisValidationProof: persistentProofStatus,
      redisBadges: persistentProofStatus.badges,
      sharedInfra: {
        redis: sharedAudit.redis,
        postgres: sharedAudit.postgres,
        kv: sharedAudit.kv,
        canImplementSharedSafely: sharedAudit.canImplementSharedSafely,
        multiInstanceBlocker: sharedAudit.multiInstanceBlocker,
        redisUrlEnvName: sharedAudit.redisUrlEnvName,
      },
      redisError: redisError ?? null,
      sharedError: redisError ?? null,
      mentorEligible: false,
      canUseTelemetryForMentor: canUseTelemetryForMentor(),
      mentorReadiness: readiness,
      namespaces: store.stats().namespaces,
      note: "AI-6.4.4g. Correctness ≠ performance. REDIS VALIDATED + PERFORMANCE WARNING possible. Never FULLY READY. Mentor disconnected. Telemetry OFF for general users.",
    });
  });

  app.get(`${base}/capabilities`, ...guards, (_req: Request, res: Response) => {
    res.json({
      capabilities: getMarketSourceCapabilities(),
      liveEnabled: isGoodTradingAiMarketLiveEnabled(),
      telemetryEnabled: isGoodTradingAiMarketTelemetryEnabled(),
      repositoryMode: getMarketTelemetryStore().stats().mode,
    });
  });

  app.get(`${base}/snapshot`, ...guards, (req: Request, res: Response) => {
    const symbol =
      typeof req.query.symbol === "string" && req.query.symbol.trim()
        ? req.query.symbol.trim().slice(0, 32)
        : "BTCUSDT";
    const started = Date.now();
    const { snapshot, issues } = buildStubSnapshot(symbol);
    const payload = toAdminPayload(snapshot);
    res.json({
      ...payload,
      validationIssues: issues,
      durationMs: Date.now() - started,
      live: false,
      source: snapshot.source,
    });
  });

  app.get(`${base}/live`, ...guards, async (req: Request, res: Response) => {
    if (!isGoodTradingAiMarketLiveEnabled()) {
      res.status(403).json({
        code: "MARKET_LIVE_DISABLED",
        message: "Live internal snapshot deshabilitado (GOODTRADING_AI_MARKET_LIVE_ENABLED).",
      });
      return;
    }
    const symbol =
      typeof req.query.symbol === "string" && req.query.symbol.trim()
        ? req.query.symbol.trim().slice(0, 32)
        : "BTCUSDT";
    const sessionId =
      typeof req.query.sessionId === "string" && req.query.sessionId.trim().length >= 8
        ? req.query.sessionId.trim().slice(0, 80)
        : undefined;
    const user = userOf(req);
    try {
      const result = await buildLiveInternalSnapshot({
        symbol,
        sessionId,
        userId: user?.id,
      });
      const payload = toAdminPayload(result.snapshot);
      res.json({
        ...payload,
        validationIssues: result.issues,
        durationMs: result.durationMs,
        live: true,
        source: "live_internal",
        completeness: result.completeness,
        adapterStatuses: result.adapterStatuses,
        telemetryMerged: result.telemetryMerged,
      });
    } catch (err) {
      res.status(500).json({
        code: "LIVE_SNAPSHOT_ERROR",
        message: err instanceof Error ? err.message : "live snapshot failed",
      });
    }
  });

  app.post(`${base}/simulate`, ...guards, (req: Request, res: Response) => {
    const parsed = simulateMarketInputSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ code: "INVALID_REQUEST", message: "Simulate input inválido." });
      return;
    }
    const started = Date.now();
    const { snapshot, issues } = buildSimulatedSnapshot(parsed.data);
    const payload = toAdminPayload(snapshot);
    res.json({
      ...payload,
      validationIssues: issues,
      durationMs: Date.now() - started,
      live: false,
      source: snapshot.source,
    });
  });

  /** AI-6.2/6.4.1 compact telemetry ingest — 202 accepted / 204 no material change optional */
  app.post(`${base}/telemetry`, ...guards, async (req: Request, res: Response) => {
    if (!isGoodTradingAiMarketTelemetryEnabled()) {
      res.status(403).json({
        code: "MARKET_TELEMETRY_DISABLED",
        message: "Telemetry ingest deshabilitado (GOODTRADING_AI_MARKET_TELEMETRY_ENABLED).",
      });
      return;
    }
    const user = userOf(req);
    if (!user) {
      res.status(401).json({ code: "UNAUTHENTICATED", message: "Authentication required." });
      return;
    }

    // redis configured but unsafe/unreachable → 503 client telemetry; snapshot path unaffected
    const created = await tryCreateConfiguredTelemetryRepository();
    if (!created.ok) {
      logTelemetryObs({
        event: "reject",
        userId: user.id,
        reason: "REDIS_REPO_UNAVAILABLE",
      });
      res.status(503).json({
        code: "TELEMETRY_REDIS_UNAVAILABLE",
        message: created.error,
        degrade: "client_telemetry",
        serverSnapshotUnaffected: true,
      });
      return;
    }
    const repo = created.repo;

    const bytes = estimateTelemetryBytes(req.body ?? {});
    if (bytes > TELEMETRY_MAX_BYTES) {
      logTelemetryObs({ event: "reject", userId: user.id, reason: "PAYLOAD_TOO_LARGE", bytes });
      res.status(413).json({ code: "PAYLOAD_TOO_LARGE", message: `Max ${TELEMETRY_MAX_BYTES} bytes.` });
      return;
    }

    const parsed = telemetryIngestRequestSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      logTelemetryObs({ event: "reject", userId: user.id, reason: "INVALID_TELEMETRY", bytes });
      res.status(400).json({ code: "INVALID_TELEMETRY", message: "Telemetry schema inválido." });
      return;
    }

    const t = parsed.data.telemetry;
    if (t.mentorEligible !== false) {
      logTelemetryObs({ event: "reject", userId: user.id, reason: "MENTOR_ELIGIBLE_FORGED" });
      res.status(400).json({
        code: "MENTOR_ELIGIBLE_FORBIDDEN",
        message: "mentorEligible must be false (AI-6.4.1).",
      });
      return;
    }
    if (
      t.orderFlow.origin === "OBSERVED" ||
      t.footprint.origin === "OBSERVED" ||
      t.lifecycle.origin === "OBSERVED"
    ) {
      logTelemetryObs({ event: "reject", userId: user.id, reason: "FORGED_OBSERVED" });
      res.status(400).json({
        code: "FORGED_OBSERVED",
        message: "Client telemetry may not claim OBSERVED origin.",
      });
      return;
    }
    const skew = Date.now() - t.clientCapturedAtMs;
    if (skew < -120_000 || skew > 300_000) {
      logTelemetryObs({
        event: "reject",
        userId: user.id,
        symbol: t.symbol,
        sequence: t.sequence,
        reason: "TIMESTAMP_SKEW",
      });
      res.status(400).json({ code: "TIMESTAMP_SKEW", message: "clientCapturedAt fuera de ventana." });
      return;
    }

    if (!t.materialChange && t.heartbeat) {
      const existing = await repoGet(repo, user.id, t.sessionId, t.symbol, t.namespace);
      if (existing && existing.lastSequence === t.sequence) {
        res.status(204).end();
        return;
      }
    }

    const entry = makeTelemetryEntry({ telemetry: t, userId: user.id });
    const put = await repoPut(repo, entry);
    if (!put.accepted) {
      logTelemetryObs({
        event: "reject",
        userId: user.id,
        symbol: t.symbol,
        sequence: t.sequence,
        reason: put.reason,
      });
      if (put.reason === "UNAVAILABLE") {
        res.status(503).json({
          code: "TELEMETRY_REDIS_UNAVAILABLE",
          message: "Redis CAS unavailable",
          degrade: "client_telemetry",
          serverSnapshotUnaffected: true,
        });
        return;
      }
      const status =
        put.reason === "REPLAY_SEQUENCE" ||
        put.reason === "DUPLICATE_SEQUENCE" ||
        put.reason === "CONFLICT"
          ? 409
          : 403;
      res.status(status).json({ code: put.reason ?? "REJECTED", message: "Telemetry rechazado." });
      return;
    }

    logTelemetryObs({
      event: "ingest",
      userId: user.id,
      symbol: t.symbol,
      sequence: t.sequence,
      bytes,
      storeSize: repo.stats().size,
    });
    res.status(202).json({
      accepted: true,
      sequence: t.sequence,
      repositoryMode: repo.stats().mode,
      expiresInMs: entry.expiresAtMs - Date.now(),
    });
  });
}
