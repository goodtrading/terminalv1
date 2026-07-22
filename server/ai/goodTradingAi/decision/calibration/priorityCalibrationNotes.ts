/**
 * AI-7.1 — Priority / template calibration notes (documented; justified changes only).
 */
export const PRIORITY_CALIBRATION_NOTES = {
  version: "ai-7.1",
  status: "DOCUMENTED",
  changesApplied: [
    {
      change: "MAX_INTERNAL_NODES 24→20; MAX_PATHS≤2; MAX_RENDERED≤12; DEPTH≤5",
      justification: "Align engine with AI-7.1 contract; previous 24 contradicted expected caps",
    },
    {
      change: "Priority-preserving prune: invalidations/conflicts/guards retained over LOW evidence",
      justification: "Never prune triggered invalidation first for LOW supporting evidence",
    },
    {
      change: "Template tie-break: UNTRUSTED/MULTI/SWEEP before ABSORPTION/GAMMA on overlap",
      justification: "Reduce keyword collisions (reclaim/gamma in multi-lens questions)",
    },
  ],
  notChanged: [
    "ACTIVE Redis performance thresholds",
    "mentorEligible remains false",
    "No OpenAI/embeddings oracle",
  ],
} as const;
