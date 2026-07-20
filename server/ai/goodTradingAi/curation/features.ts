import { isGoodTradingAiCurationEnabledEnv } from "../../../lib/runtimeEnv";

/** Knowledge Curation Lab. Default OFF. Independent of Mentor/Calibration/Extractor. */
export function isGoodTradingAiCurationEnabled(): boolean {
  return isGoodTradingAiCurationEnabledEnv();
}
