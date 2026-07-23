/**
 * Client-side blindness guards for Critical Calibration UI.
 * Does not fetch reveal. Does not treat localStorage as answer authority.
 */

const FORBIDDEN_BLIND_KEYS = [
  "engineOutcome",
  "enginePreference",
  "expectedOutcome",
  "proposalCandidate",
  "proposalRecommendation",
  "ruleChange",
  "steeringScore",
  "templateOutcome",
  "passFail",
  "suggestedAnswer",
  "whyThisQuestion",
  "infoGainScore",
  "scoreComponents",
] as const;

export const ALLOWED_BLIND_KEYS = [
  "sessionId",
  "questionId",
  "prompt",
  "questionType",
  "relatedLenses",
  "allowsDepends",
  "confidenceOptions",
  "mentorEligible",
] as const;

export const PROPOSAL_SCHEMA_WARNING = "PROPOSAL_SCHEMA_NOT_READY_FOR_BRAIN_APPLICATION" as const;
export const SAFE_FOR_CALIBRATION_SESSION = "SAFE_FOR_CALIBRATION_SESSION" as const;
export const NOT_SAFE_FOR_BRAIN_APPLICATION = "NOT_SAFE_FOR_BRAIN_APPLICATION" as const;

export function assertClientBlindPacketSafe(packet: Record<string, unknown>): void {
  const keys = Object.keys(packet);
  for (const k of keys) {
    if ((FORBIDDEN_BLIND_KEYS as readonly string[]).includes(k)) {
      throw new Error(`BLINDNESS_VIOLATION: ${k}`);
    }
  }
  const blob = JSON.stringify(packet).toLowerCase();
  for (const f of [
    "enginepreference",
    "engine_outcome",
    "engineoutcome",
    "expectedoutcome",
    "suggestedanswer",
    "passfail",
  ]) {
    if (blob.includes(f)) throw new Error(`BLINDNESS_VIOLATION: ${f}`);
  }
}

export function canReveal(submittedForQuestion: boolean): boolean {
  return submittedForQuestion === true;
}

export function redactSessionId(id: string): string {
  if (!id || id.length < 8) return "…";
  return `${id.slice(0, 8)}…`;
}

/** localStorage must never be the authority for answers. */
export function isLocalStorageAnswerAuthority(): false {
  return false;
}
