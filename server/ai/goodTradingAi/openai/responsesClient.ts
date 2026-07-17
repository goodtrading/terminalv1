/**
 * Injectable OpenAI Responses client (AI-3).
 * Routes/services must not import the official SDK directly.
 */

export type OpenAIResponsesCreateParams = {
  model: string;
  instructions: string;
  input: string;
  maxOutputTokens: number;
  store: false;
  reasoningEffort?: "none" | "low" | "medium" | "high" | "xhigh" | null;
  /** JSON schema for structured outputs (strict). */
  jsonSchema: {
    name: string;
    schema: Record<string, unknown>;
  };
  signal?: AbortSignal;
  /** Pseudonymous only — never email/userId plaintext. */
  safetyIdentifier?: string;
};

export type OpenAIResponsesCreateResult = {
  outputText: string;
  model: string;
  responseId?: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
  status?: string;
};

export type OpenAIResponsesClientErrorKind =
  | "auth"
  | "rate_limit"
  | "timeout"
  | "bad_request"
  | "unavailable"
  | "aborted"
  | "unknown";

export class OpenAIResponsesClientError extends Error {
  readonly kind: OpenAIResponsesClientErrorKind;
  readonly status?: number;
  readonly retryable: boolean;

  constructor(
    kind: OpenAIResponsesClientErrorKind,
    message: string,
    opts?: { status?: number; retryable?: boolean; cause?: unknown },
  ) {
    super(message);
    this.name = "OpenAIResponsesClientError";
    this.kind = kind;
    this.status = opts?.status;
    this.retryable = opts?.retryable ?? false;
    if (opts?.cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = opts.cause;
    }
  }
}

export interface OpenAIResponsesClient {
  create(params: OpenAIResponsesCreateParams): Promise<OpenAIResponsesCreateResult>;
}
