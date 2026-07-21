export { buildCompactMarketTelemetry } from "./buildCompactMarketTelemetry";
export {
  computeMaterialFingerprint,
  hasMaterialChange,
  fingerprintFromTelemetry,
} from "./materialChange";
export {
  getMarketTelemetryStore,
  resetMarketTelemetryStoreForTests,
  makeTelemetryEntry,
  InMemoryMarketTelemetryStore,
} from "./telemetryStore";
export type { MarketTelemetryRepository, TelemetryStoreEntry, TelemetryPutResult } from "./telemetryStore";
export { applyClientTelemetryToBundle } from "./clientTelemetryAdapter";
export { logTelemetryObs } from "./observability";
export { auditRailwayTelemetryTopology } from "./railwayAudit";
export type { RailwayTelemetryAudit, ReplicaTopology, RepositorySafety } from "./railwayAudit";
export { canUseTelemetryForMentor } from "./mentorGate";
export {
  buildTelemetryMentorReadiness,
  MENTOR_INTEGRATION_NOT_ENABLED,
} from "./mentorReadiness";
export type { TelemetryMentorReadiness } from "./mentorReadiness";
export {
  auditSharedTelemetryInfra,
  createMarketTelemetryRepository,
  createMarketTelemetryRepositoryAsync,
  FakeSharedMarketTelemetryRepository,
  TelemetryRepositoryConfigError,
  resetMarketTelemetryRepositoryFactoryForTests,
  __setMarketTelemetryRepositoryForTests,
  getConfiguredTelemetryRepositoryMode,
  resolveTelemetryRepositoryOrMemory,
  tryCreateConfiguredTelemetryRepository,
  normalizeTelemetryRepositoryMode,
} from "./repositoryFactory";
export type { SharedInfraAudit, SharedInfraClass, TelemetryRepositoryMode } from "./repositoryFactory";
export {
  buildTelemetryRepositoryKey,
  buildTelemetrySessionIndexKey,
  hashUserId,
  hashSessionId,
} from "./redisKeys";
export {
  loadRedisTelemetryConfig,
  redactRedisConfigForStatus,
  discoverRedisUrlEnvName,
  RedisTelemetryConfigError,
  isAllowRedisSmokeEnv,
  resolveTelemetryTtlMs,
  resetRedisEnvContractWarningsForTests,
  REDIS_URL_ENV_PRIORITY,
} from "./redisConfig";
export { FakeRedisClient, RealRedisClient, TELEMETRY_CAS_LUA, TELEMETRY_ATOMIC_PUT_LUA, createRealRedisClient, getRedisClientLifecycleCounters, resetRedisClientLifecycleCounters } from "./redisClient";
export type { AtomicPutArgs, RedisCasOutcome } from "./redisClient";
export {
  RedisMarketTelemetryRepository,
  repoPut,
  repoGet,
} from "./redisMarketTelemetryRepository";
export {
  redisTelemetryRecordSchema,
  entryToRedisRecord,
  parseRedisRecord,
  serializeRedisRecord,
  REDIS_TELEMETRY_RECORD_SCHEMA_VERSION,
} from "./redisRecord";
export { auditRailwayRedisConfig } from "./redisRailwayAudit";
export type { RedisConfigClassification, RedisRailwayConfigAudit } from "./redisRailwayAudit";
export {
  redactRedisSecrets,
  toSafeRedisError,
  containsRedisSecretLeak,
} from "./redisSecretRedaction";
export type { SafeRedisError, SafeRedisErrorCode } from "./redisSecretRedaction";
export {
  getRedisSmokeValidationFacts,
  resetRedisSmokeValidationFactsForTests,
  setRedisSmokeValidationFacts,
  redisSmokeFactsForStatus,
  classifyLatencyP95,
  percentile,
} from "./redisSmokeValidation";
export type {
  RedisSmokeValidationFacts,
  LatencyVerdict,
  SharedRepositoryVerdict,
} from "./redisSmokeValidation";
export {
  assertRedisSmokeAuthorized,
  runRedisProductionSmoke,
  runFakeRedisFailureRecoverySmoke,
} from "./redisSmokeRunner";
export type { RedisSmokeReport } from "./redisSmokeRunner";
export { auditRailwayRedisProvisioning } from "./redisProvisioningAudit";
export type {
  RailwayRedisProvisioningClass,
  RailwayRedisProvisioningAudit,
} from "./redisProvisioningAudit";
export {
  buildRedisValidationProof,
  buildRedisValidationProofKey,
  parseRedisValidationProof,
  serializeRedisValidationProof,
  writeRedisValidationProof,
  readRedisValidationProof,
  redisValidationProofForStatus,
  loadRedisValidationProofForStatus,
  latencyVerdictToClass,
  REDIS_VALIDATION_PROOF_TTL_MS,
  REDIS_VALIDATION_PROOF_SCHEMA_VERSION,
  redisValidationProofSchema,
} from "./redisValidationProof";
export type { RedisValidationProof, LatencyClass } from "./redisValidationProof";
export {
  runRedisLatencyDiagnostic,
  runFakeRedisLatencyDiagnostic,
  classifyRedisRouteClass,
  classifyRedisTopologyClass,
  isAllowRedisDiagnosticEnv,
  diagnosticReportForLog,
} from "./redisLatencyDiagnostic";
export type {
  RedisLatencyDiagnosticReport,
  LatencyBlockStats,
  RedisRouteClass,
  RedisTopologyClass,
} from "./redisLatencyDiagnostic";
