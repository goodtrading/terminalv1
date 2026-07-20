/**
 * AI-6.3 — Mentor must never consume market telemetry.
 */
import { canUseTelemetryForMentor as sharedGate } from "@shared/goodTradingAiMarketTelemetry";
import type { CompactMarketTelemetry } from "@shared/goodTradingAiMarketTelemetry";

/** Always false in AI-6.3 — mandatory NO-GO for Mentor integration. */
export function canUseTelemetryForMentor(
  _telemetry?: CompactMarketTelemetry | null,
): false {
  return sharedGate(_telemetry);
}
