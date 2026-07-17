/** Strict JSON schema for Mentors structured outputs (OpenAI Responses API). */

export const MENTOR_STRUCTURED_SCHEMA_NAME = "goodtrading_mentor_v1";

export const MENTOR_STRUCTURED_JSON_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: [
    "summary",
    "observations",
    "educationalNote",
    "warnings",
    "usedKnowledgeIds",
    "coverageAssessment",
  ],
  properties: {
    summary: { type: "string" },
    observations: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["kind", "title", "detail", "knowledgeIds"],
        properties: {
          kind: {
            type: "string",
            enum: [
              "concept",
              "principle",
              "definition",
              "limitation",
              "process",
              "rule",
              "heuristic",
              "example",
              "anti_pattern",
            ],
          },
          title: { type: "string" },
          detail: { type: "string" },
          knowledgeIds: {
            type: "array",
            items: { type: "string" },
          },
        },
      },
    },
    educationalNote: { type: "string" },
    warnings: {
      type: "array",
      items: { type: "string" },
    },
    usedKnowledgeIds: {
      type: "array",
      items: { type: "string" },
    },
    coverageAssessment: {
      type: "string",
      enum: ["high", "medium", "limited"],
    },
  },
};

export type MentorStructuredOutput = {
  summary: string;
  observations: Array<{
    kind: string;
    title: string;
    detail: string;
    knowledgeIds: string[];
  }>;
  educationalNote: string;
  warnings: string[];
  usedKnowledgeIds: string[];
  coverageAssessment: "high" | "medium" | "limited";
};
