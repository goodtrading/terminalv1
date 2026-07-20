import { isGoodTradingAiExtractorEnabledEnv } from "../../../lib/runtimeEnv";

/** Knowledge Acquisition Inbox. Default OFF. Independent of Mentor/Calibration flags. */
export function isGoodTradingAiExtractorEnabled(): boolean {
  return isGoodTradingAiExtractorEnabledEnv();
}
