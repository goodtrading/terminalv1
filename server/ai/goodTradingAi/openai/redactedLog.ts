import { isProduction } from "../../../lib/runtimeEnv";

export type MentorProviderLogEvent = {
  requestId: string;
  provider: string;
  model: string;
  durationMs: number;
  success: boolean;
  knowledgeEntryCount: number;
  knowledgeIds?: string[];
  inputTokens?: number;
  outputTokens?: number;
  errorCategory?: string;
  /** Optional short hash of user id — never email. */
  userHash?: string;
};

/**
 * Redacted Mentors provider log — never full prompts, keys, or PII.
 */
export function logMentorProviderEvent(event: MentorProviderLogEvent): void {
  const payload = {
    tag: "GoodTradingAI",
    requestId: event.requestId,
    provider: event.provider,
    model: event.model,
    durationMs: event.durationMs,
    success: event.success,
    knowledgeEntryCount: event.knowledgeEntryCount,
    knowledgeIds: isProduction ? undefined : event.knowledgeIds,
    inputTokens: event.inputTokens,
    outputTokens: event.outputTokens,
    errorCategory: event.errorCategory,
    userHash: event.userHash,
  };
  if (event.success) {
    console.info("[GoodTradingAI]", JSON.stringify(payload));
  } else {
    console.warn("[GoodTradingAI]", JSON.stringify(payload));
  }
}
