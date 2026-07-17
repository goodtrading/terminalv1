import { isGoodTradingAiCalibrationEnabledEnv } from "../../../lib/runtimeEnv";

/** Calibration Lab flag — default OFF. Independent of Mentor product flag. */
export function isGoodTradingAiCalibrationEnabled(): boolean {
  return isGoodTradingAiCalibrationEnabledEnv();
}
