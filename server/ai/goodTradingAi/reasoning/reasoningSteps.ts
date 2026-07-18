import type { KnowledgeRelationKind } from "../knowledge/types";

export type ReasoningStepRole =
  | "anchor"
  | "requires"
  | "dependsOn"
  | "supports"
  | "relatedTo"
  | "childConcept"
  | "parentConcept"
  | "invalidates"
  | "contradicts"
  | "hypothesis"
  | "confirmation"
  | "conclusion";

export type ReasoningChainStep = {
  index: number;
  knowledgeId: string;
  title: string;
  detail: string;
  role: ReasoningStepRole;
  viaRelation?: KnowledgeRelationKind;
};

export type MentorReasoningBlock = {
  title: string;
  steps: Array<{
    index: number;
    label: string;
    detail: string;
    knowledgeId?: string;
    role: ReasoningStepRole;
  }>;
  conclusion: string;
  contradictions: string[];
  chainIds: string[];
  /** True when scenario_analysis framing applied. */
  scenarioMode?: boolean;
  /** True when multi-concept priority framing applied. */
  multiConceptMode?: boolean;
};

export const RELATION_PRIORITY: readonly KnowledgeRelationKind[] = [
  "requires",
  "dependsOn",
  "supports",
  "relatedTo",
  "childConcept",
  "parentConcept",
  "invalidates",
  "contradicts",
] as const;

export const MAX_REASONING_EXPAND_LEVELS = 2;
export const MAX_REASONING_CHAIN_STEPS = 8;
