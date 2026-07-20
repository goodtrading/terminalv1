import {
  isGoodTradingAiMarketLiveEnabledEnv,
  isGoodTradingAiMarketSnapshotEnabledEnv,
  isGoodTradingAiMarketTelemetryAutoPublishInternalEnv,
  isGoodTradingAiMarketTelemetryEnabledEnv,
  getGoodTradingAiTelemetryRepositoryModeEnv,
} from "../../../lib/runtimeEnv";

export function isGoodTradingAiMarketSnapshotEnabled(): boolean {
  return isGoodTradingAiMarketSnapshotEnabledEnv();
}

export function isGoodTradingAiMarketLiveEnabled(): boolean {
  return isGoodTradingAiMarketLiveEnabledEnv();
}

export function isGoodTradingAiMarketTelemetryEnabled(): boolean {
  return isGoodTradingAiMarketTelemetryEnabledEnv();
}

export function isGoodTradingAiMarketTelemetryAutoPublishInternal(): boolean {
  return isGoodTradingAiMarketTelemetryAutoPublishInternalEnv();
}

export function getGoodTradingAiTelemetryRepositoryMode(): "memory" | "redis" {
  return getGoodTradingAiTelemetryRepositoryModeEnv();
}
