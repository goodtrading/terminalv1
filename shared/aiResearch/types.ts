export type ResearchClassification = "FACT" | "OBSERVATION" | "DERIVATION" | "HYPOTHESIS" | "INTERPRETATION" | "EXPERIMENT_RESULT" | "RECOMMENDATION_FOR_RESEARCH";
export type KnowledgeNodeType = "PRINCIPLE" | "RULE" | "HEURISTIC" | "DEFINITION" | "EXAMPLE" | "ANTI_PATTERN" | "SETUP";
export type KnowledgeLifecycle = "DRAFT" | "REVIEWED" | "CANONICAL";
export type KnowledgeEdgeType = "SUPPORTS" | "CONTRADICTS" | "DEPENDS_ON" | "EXAMPLE_OF" | "APPLIES_TO" | "INVALIDATES" | "RELATED_TO";
export type FindingStrength = "WEAK" | "MODERATE" | "STRONG";
export type ResearchStatus = "DRAFT" | "RESEARCHING" | "COMPLETED" | "INCONCLUSIVE" | "FAILED" | "CANCELED";
export type ResearchStage = "THINKING" | "RETRIEVING" | "PLANNING" | "VALIDATING" | "TESTING" | "ANALYZING" | "DONE" | "INCONCLUSIVE" | "FAILED" | "CANCELED";

export type CitationRef = { id: string; kind: "K" | "E" | "T" | "D"; label: string; sourceId: string };
export type KnowledgeNode = {
  id: string; type: KnowledgeNodeType; title: string; content: string; tags: string[];
  market?: string; instrument?: string; source: string; provenance: string; version: string;
  lifecycle: KnowledgeLifecycle; createdAt: string; updatedAt: string;
  edges: Array<{ type: KnowledgeEdgeType; targetId: string }>;
};
export type KnowledgeDraft = KnowledgeNode & { lifecycle: "DRAFT"; derivedFromFindingId?: string };

export type ResearchHypothesis = {
  hypothesisId: string; statement: string; rationale: string; requiredEvidence: string[];
  requiredCapabilities: string[]; testable: boolean; strategyCompatible: boolean;
  assumptions: string[]; invalidatingEvidence: string[]; status: "PROPOSED" | "TESTED" | "SUPPORTED" | "INVALIDATED" | "NOT_TESTABLE_WITH_CURRENT_FEATURES";
  citations: CitationRef[];
};
export type ResearchPlan = {
  question: string; hypothesisIds: string[]; datasetRequirements: string[]; features: string[];
  strategyMapping: string[]; metrics: string[]; invalidationCriteria: string[];
  budget: ResearchBudget; citations: CitationRef[];
};
export type ResearchBudget = { maxModelCalls: number; maxToolCalls: number; maxExperiments: number; maxVariants: number; maxIterations: number };
export type ResearchExperiment = {
  experimentId: string; request: unknown; result?: unknown; sample: "IN_SAMPLE" | "OUT_OF_SAMPLE" | "INSUFFICIENT_VALIDATION";
  status: "PLANNED" | "VALIDATED" | "COMPLETED" | "FAILED" | "CANCELED"; citations: CitationRef[];
};
export type ResearchFinding = {
  findingId: string; claim: string; classification: "OBSERVED" | "INFERENCE" | "UNKNOWN";
  supportingExperimentIds: string[]; supportingEvidence: CitationRef[]; contradictingEvidence: CitationRef[];
  strength: FindingStrength; limitations: string[]; status: "DRAFT" | "REVIEWED"; citations: CitationRef[];
};
export type ResearchProject = {
  projectId: string; ownerUserId?: number; title: string; question: string; status: ResearchStatus; stage: ResearchStage;
  createdAt: string; updatedAt: string; hypotheses: ResearchHypothesis[]; plan?: ResearchPlan;
  experiments: ResearchExperiment[]; findings: ResearchFinding[]; openQuestions: string[]; knowledgeDrafts: KnowledgeDraft[];
  report?: ResearchReport; usage: { modelCalls: number; toolCalls: number; experiments: number; variants: number };
};
export type ResearchReport = {
  question: string; backgroundKnowledge: CitationRef[]; hypotheses: ResearchHypothesis[]; method: string;
  datasets: string[]; experiments: ResearchExperiment[]; results: ResearchFinding[]; contradictingEvidence: CitationRef[];
  limitations: string[]; conclusion: string; openQuestions: string[]; knowledgeDrafts: KnowledgeDraft[]; citations: CitationRef[];
};

export type StrategyProposal = { hypothesisId: string; strategy: unknown; explanation: string; citations: CitationRef[] };
export type MentorAnswer = { answer: string; classification: ResearchClassification[]; citations: CitationRef[]; limitations: string[]; provider: { id: string; model?: string; mocked: boolean } };
export type AIProvider = {
  readonly id: string; readonly model?: string; readonly mocked: boolean;
  generate(input: { prompt: string; schema: string; signal?: AbortSignal }): Promise<unknown>;
  structuredGenerate(input: { prompt: string; schema: string; signal?: AbortSignal }): Promise<unknown>;
  health(): Promise<{ ok: boolean; reason?: string }>;
};
export type ResearchToolRegistry = {
  searchKnowledge(input: { query: string; maxResults?: number }): Promise<KnowledgeNode[]>;
  getKnowledgeNode(input: { id: string }): Promise<KnowledgeNode | null>;
  validateStrategy(input: { strategy: unknown }): Promise<unknown>;
  runExperiment(input: { strategy: unknown; dataset: unknown; config: unknown }): Promise<unknown>;
  getExperiment(input: { experimentId: string }): Promise<unknown>;
  getMetrics(input: { experimentId: string }): Promise<unknown>;
  getTrades(input: { experimentId: string }): Promise<unknown>;
  getEvidence(input: { experimentId: string }): Promise<unknown>;
  compareExperiments(input: { experimentIds: string[] }): Promise<unknown>;
};
export type DeterministicProviderScenario = { questionPattern?: string; knowledgeQuery?: string; strategy: unknown; rationale: string; statement: string };
