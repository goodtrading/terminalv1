import OpenAI from "openai";
import {
  OpenAIResponsesClientError,
  type OpenAIResponsesClient,
  type OpenAIResponsesCreateParams,
  type OpenAIResponsesCreateResult,
} from "./responsesClient";

/**
 * Thin wrapper over the official OpenAI SDK Responses API.
 * No tools / Assistants / file search / web search / MCP.
 */
export class OfficialOpenAIResponsesClient implements OpenAIResponsesClient {
  private readonly client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey, maxRetries: 0 });
  }

  async create(params: OpenAIResponsesCreateParams): Promise<OpenAIResponsesCreateResult> {
    try {
      const body: Record<string, unknown> = {
        model: params.model,
        instructions: params.instructions,
        input: params.input,
        max_output_tokens: params.maxOutputTokens,
        store: false,
        text: {
          format: {
            type: "json_schema",
            name: params.jsonSchema.name,
            strict: true,
            schema: params.jsonSchema.schema,
          },
        },
      };

      if (params.reasoningEffort) {
        body.reasoning = { effort: params.reasoningEffort };
      }
      if (params.safetyIdentifier) {
        body.safety_identifier = params.safetyIdentifier.slice(0, 64);
      }

      const response = await this.client.responses.create(
        body as Parameters<OpenAI["responses"]["create"]>[0],
        { signal: params.signal, maxRetries: 0 },
      );

      const outputText =
        typeof (response as { output_text?: string }).output_text === "string"
          ? (response as { output_text: string }).output_text
          : extractOutputText(response);

      const usageRaw = (response as { usage?: Record<string, number> }).usage;
      return {
        outputText: outputText ?? "",
        model: String((response as { model?: string }).model ?? params.model),
        responseId:
          typeof (response as { id?: string }).id === "string"
            ? (response as { id: string }).id
            : undefined,
        status:
          typeof (response as { status?: string }).status === "string"
            ? (response as { status: string }).status
            : undefined,
        usage: usageRaw
          ? {
              inputTokens: usageRaw.input_tokens ?? usageRaw.prompt_tokens,
              outputTokens: usageRaw.output_tokens ?? usageRaw.completion_tokens,
              totalTokens: usageRaw.total_tokens,
            }
          : undefined,
      };
    } catch (err) {
      throw mapSdkError(err, params.signal);
    }
  }
}

function extractOutputText(response: unknown): string {
  const r = response as {
    output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
  };
  const texts: string[] = [];
  for (const item of r.output ?? []) {
    for (const c of item.content ?? []) {
      if (c?.type === "output_text" && typeof c.text === "string") texts.push(c.text);
    }
  }
  return texts.join("\n").trim();
}

function mapSdkError(err: unknown, signal?: AbortSignal): OpenAIResponsesClientError {
  if (signal?.aborted) {
    return new OpenAIResponsesClientError("aborted", "Request aborted", { retryable: false, cause: err });
  }

  const anyErr = err as {
    name?: string;
    message?: string;
    status?: number;
    statusCode?: number;
    code?: string;
    type?: string;
  };

  if (anyErr?.name === "AbortError" || /aborted|timeout|etimedout|econnaborted/i.test(String(anyErr?.message ?? ""))) {
    const isTimeout = /timeout|etimedout/i.test(String(anyErr?.message ?? ""));
    return new OpenAIResponsesClientError(isTimeout ? "timeout" : "aborted", String(anyErr?.message ?? "aborted"), {
      retryable: isTimeout,
      cause: err,
    });
  }

  const status = anyErr.status ?? anyErr.statusCode;
  if (status === 401 || status === 403) {
    return new OpenAIResponsesClientError("auth", "OpenAI auth failed", {
      status,
      retryable: false,
      cause: err,
    });
  }
  if (status === 429) {
    return new OpenAIResponsesClientError("rate_limit", "OpenAI rate limited", {
      status,
      retryable: true,
      cause: err,
    });
  }
  if (status === 400) {
    return new OpenAIResponsesClientError("bad_request", "OpenAI bad request", {
      status,
      retryable: false,
      cause: err,
    });
  }
  if (status != null && status >= 500) {
    return new OpenAIResponsesClientError("unavailable", "OpenAI unavailable", {
      status,
      retryable: true,
      cause: err,
    });
  }

  return new OpenAIResponsesClientError("unknown", "OpenAI request failed", {
    status,
    retryable: false,
    cause: err,
  });
}

export function createOfficialOpenAIResponsesClient(apiKey: string): OfficialOpenAIResponsesClient {
  return new OfficialOpenAIResponsesClient(apiKey);
}
