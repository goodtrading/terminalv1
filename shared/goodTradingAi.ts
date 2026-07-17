/**
 * GoodTrading AI — shared contracts (schemaVersion 1.0).
 * Client-safe types + Zod validation. No provider secrets / knowledge content.
 */
import { z } from "zod";

export const GOODTRADING_AI_SCHEMA_VERSION = "1.0" as const;

export const goodTradingAiModeSchema = z.enum(["mentor", "market", "trade_review"]);
export type GoodTradingAIMode = z.infer<typeof goodTradingAiModeSchema>;

/** Modes available in FASE AI-1. */
export const AI1_ALLOWED_MODES: readonly GoodTradingAIMode[] = ["mentor"] as const;

export const goodTradingAiErrorCodeSchema = z.enum([
  "AI_DISABLED",
  "UNAUTHENTICATED",
  "INVALID_REQUEST",
  "MODE_NOT_AVAILABLE",
  "RATE_LIMITED",
  "PROVIDER_TIMEOUT",
  "PROVIDER_ERROR",
  // AI-3 OpenAI Mentors provider
  "OPENAI_AUTH_ERROR",
  "OPENAI_RATE_LIMITED",
  "OPENAI_TIMEOUT",
  "OPENAI_BAD_RESPONSE",
  "OPENAI_UNAVAILABLE",
  "PROVIDER_CONFIGURATION_ERROR",
]);
export type GoodTradingAIErrorCode = z.infer<typeof goodTradingAiErrorCodeSchema>;

export const MENTOR_MESSAGE_MIN = 1;
export const MENTOR_MESSAGE_MAX = 2000;

export const goodTradingAiChatRequestSchema = z
  .object({
    schemaVersion: z.literal(GOODTRADING_AI_SCHEMA_VERSION),
    mode: goodTradingAiModeSchema,
    message: z.string().trim().min(MENTOR_MESSAGE_MIN).max(MENTOR_MESSAGE_MAX),
    conversationId: z.string().trim().min(1).max(120).optional(),
  })
  .strict();

export type GoodTradingAIChatRequest = z.infer<typeof goodTradingAiChatRequestSchema>;

export const goodTradingAiEvidenceKindSchema = z.enum([
  // AI-1
  "concept",
  "principle",
  "definition",
  "limitation",
  "process",
  // AI-2
  "rule",
  "heuristic",
  "example",
  "anti_pattern",
]);
export type GoodTradingAIEvidenceKind = z.infer<typeof goodTradingAiEvidenceKindSchema>;

export const goodTradingAiObservationSchema = z.object({
  id: z.string().min(1).max(80),
  kind: goodTradingAiEvidenceKindSchema,
  title: z.string().min(1).max(160),
  detail: z.string().min(1).max(2000),
  concepts: z.array(z.string().min(1).max(80)).max(12).optional(),
});
export type GoodTradingAIObservation = z.infer<typeof goodTradingAiObservationSchema>;

/** Client-safe citation — never includes full knowledge content. */
export const goodTradingAiKnowledgeReferenceSchema = z.object({
  id: z.string().min(1).max(80),
  title: z.string().min(1).max(160),
  kind: z.string().min(1).max(40),
  category: z.string().min(1).max(40),
});
export type GoodTradingAIKnowledgeReference = z.infer<typeof goodTradingAiKnowledgeReferenceSchema>;

export const goodTradingAiCoverageSchema = z.enum(["high", "medium", "limited"]);
export type GoodTradingAICoverage = z.infer<typeof goodTradingAiCoverageSchema>;

export const goodTradingAiProviderMetaSchema = z.object({
  id: z.string().min(1).max(64),
  model: z.string().min(1).max(64),
  mocked: z.boolean(),
});
export type GoodTradingAIProviderMeta = z.infer<typeof goodTradingAiProviderMetaSchema>;

export const goodTradingAiUsageSchema = z.object({
  inputChars: z.number().int().nonnegative(),
  outputChars: z.number().int().nonnegative(),
  knowledgeHits: z.number().int().nonnegative(),
  /** AI-3 optional provider telemetry (never includes prompts/keys). */
  inputTokens: z.number().int().nonnegative().optional(),
  outputTokens: z.number().int().nonnegative().optional(),
  durationMs: z.number().int().nonnegative().optional(),
  estimatedCostUsd: z.number().nonnegative().nullable().optional(),
});
export type GoodTradingAIUsage = z.infer<typeof goodTradingAiUsageSchema>;

export const goodTradingAiChatResponseSchema = z.object({
  schemaVersion: z.literal(GOODTRADING_AI_SCHEMA_VERSION),
  requestId: z.string().min(1),
  mode: z.literal("mentor"),
  summary: z.string().min(1).max(4000),
  observations: z.array(goodTradingAiObservationSchema).max(20),
  educationalNote: z.string().min(1).max(1000),
  warnings: z.array(z.string().min(1).max(500)).max(20),
  provider: goodTradingAiProviderMetaSchema,
  usage: goodTradingAiUsageSchema,
  generatedAt: z.string().datetime(),
  conversationId: z.string().min(1).max(120).optional(),
  /** AI-2: internal citations (id/title/kind/category only). */
  knowledgeReferences: z.array(goodTradingAiKnowledgeReferenceSchema).max(20).optional(),
  /** AI-2: retrieval coverage label. */
  coverage: goodTradingAiCoverageSchema.optional(),
});
export type GoodTradingAIChatResponse = z.infer<typeof goodTradingAiChatResponseSchema>;

export const goodTradingAiErrorBodySchema = z.object({
  code: goodTradingAiErrorCodeSchema,
  message: z.string().min(1).max(400),
  requestId: z.string().min(1).optional(),
  /** Alias for older clients that read `error`. */
  error: goodTradingAiErrorCodeSchema.optional(),
});
export type GoodTradingAIErrorBody = z.infer<typeof goodTradingAiErrorBodySchema>;

/** Detect AI-1 request shape (vs legacy OpenAI chat payload). */
export function isGoodTradingAiV1Request(body: unknown): boolean {
  if (!body || typeof body !== "object" || Array.isArray(body)) return false;
  const b = body as Record<string, unknown>;
  return b.schemaVersion === GOODTRADING_AI_SCHEMA_VERSION || typeof b.mode === "string";
}

export const AI_ERROR_HTTP_STATUS: Record<GoodTradingAIErrorCode, number> = {
  AI_DISABLED: 403,
  UNAUTHENTICATED: 401,
  INVALID_REQUEST: 400,
  MODE_NOT_AVAILABLE: 400,
  RATE_LIMITED: 429,
  PROVIDER_TIMEOUT: 504,
  PROVIDER_ERROR: 502,
  OPENAI_AUTH_ERROR: 502,
  OPENAI_RATE_LIMITED: 429,
  OPENAI_TIMEOUT: 504,
  OPENAI_BAD_RESPONSE: 502,
  OPENAI_UNAVAILABLE: 502,
  PROVIDER_CONFIGURATION_ERROR: 503,
};

export const SAFE_AI_ERROR_MESSAGES: Record<GoodTradingAIErrorCode, string> = {
  AI_DISABLED: "GoodTrading AI está deshabilitado en este entorno.",
  UNAUTHENTICATED: "Debés iniciar sesión para usar GoodTrading AI.",
  INVALID_REQUEST: "Solicitud inválida.",
  MODE_NOT_AVAILABLE: "Ese modo de AI no está disponible en esta fase.",
  RATE_LIMITED: "Demasiadas solicitudes. Probá de nuevo en un momento.",
  PROVIDER_TIMEOUT: "El proveedor de AI no respondió a tiempo.",
  PROVIDER_ERROR: "El proveedor de AI no pudo completar la solicitud.",
  OPENAI_AUTH_ERROR: "El proveedor de AI no está autenticado correctamente. Contactá al administrador.",
  OPENAI_RATE_LIMITED: "El proveedor de AI está saturado. Probá de nuevo en un momento.",
  OPENAI_TIMEOUT: "El proveedor de AI no respondió a tiempo. Podés reintentar.",
  OPENAI_BAD_RESPONSE: "La respuesta del proveedor de AI no fue válida. Podés reintentar.",
  OPENAI_UNAVAILABLE: "El proveedor de AI no está disponible temporalmente. Podés reintentar.",
  PROVIDER_CONFIGURATION_ERROR: "GoodTrading AI no está configurado correctamente en el servidor.",
};
