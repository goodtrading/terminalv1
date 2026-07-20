/**
 * Client wrapper — build compact telemetry from reduced selector inputs.
 * Never passes raw trades/book/heatmap.
 */
export {
  buildCompactMarketTelemetry,
  fingerprintFromTelemetry,
  TELEMETRY_DEFAULT_INTERVAL_MS,
  TELEMETRY_MIN_INTERVAL_MS,
  TELEMETRY_MAX_BYTES,
  canUseTelemetryForMentor,
  type CompactMarketTelemetry,
  type CompactTelemetrySelectorInput,
  type TelemetryMode,
} from "@shared/goodTradingAiMarketTelemetry";
