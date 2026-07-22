/**
 * AI-7.3 Critical Mentor Calibration feature flag. Default OFF.
 */
import { envBool } from "../../../lib/runtimeEnv";

export function isGoodTradingAiCriticalCalibrationEnabled(): boolean {
  return envBool("GOODTRADING_AI_CRITICAL_CALIBRATION_ENABLED", false);
}
