import {
  OpenAIResponsesClientError,
  type OpenAIResponsesClient,
  type OpenAIResponsesCreateParams,
  type OpenAIResponsesCreateResult,
} from "./responsesClient";

export type FakeOpenAIScenario =
  | "success"
  | "bad_json"
  | "timeout"
  | "rate_limit"
  | "auth"
  | "refusal"
  | "invented_ids"
  | "banned_phrases"
  | "unavailable"
  | "cancel";

export type FakeOpenAIResponsesClientOptions = {
  scenario?: FakeOpenAIScenario;
  /** Override structured JSON body (string). */
  outputText?: string;
  usage?: OpenAIResponsesCreateResult["usage"];
  model?: string;
  /** Delay before resolve/reject (ms). */
  delayMs?: number;
  /** Knowledge ids present in retrieval for success defaults. */
  knownIds?: string[];
  onCreate?: (params: OpenAIResponsesCreateParams) => void;
};

/**
 * Deterministic fake for unit/evals — never hits the network.
 */
export class FakeOpenAIResponsesClient implements OpenAIResponsesClient {
  readonly calls: OpenAIResponsesCreateParams[] = [];
  private scenario: FakeOpenAIScenario;
  private readonly opts: FakeOpenAIResponsesClientOptions;

  constructor(opts: FakeOpenAIResponsesClientOptions = {}) {
    this.opts = opts;
    this.scenario = opts.scenario ?? "success";
  }

  setScenario(scenario: FakeOpenAIScenario): void {
    this.scenario = scenario;
  }

  async create(params: OpenAIResponsesCreateParams): Promise<OpenAIResponsesCreateResult> {
    this.calls.push(params);
    this.opts.onCreate?.(params);

    if (params.signal?.aborted || this.scenario === "cancel") {
      throw new OpenAIResponsesClientError("aborted", "Request aborted", { retryable: false });
    }

    const delay = this.opts.delayMs ?? 0;
    if (delay > 0) {
      await sleep(delay, params.signal);
    }
    if (params.signal?.aborted) {
      throw new OpenAIResponsesClientError("aborted", "Request aborted", { retryable: false });
    }

    switch (this.scenario) {
      case "timeout":
        throw new OpenAIResponsesClientError("timeout", "Fake timeout", { retryable: true });
      case "rate_limit":
        throw new OpenAIResponsesClientError("rate_limit", "Fake 429", { status: 429, retryable: true });
      case "auth":
        throw new OpenAIResponsesClientError("auth", "Fake 401", { status: 401, retryable: false });
      case "unavailable":
        throw new OpenAIResponsesClientError("unavailable", "Fake 503", { status: 503, retryable: true });
      case "bad_json":
        return result(params, this.opts, "{not-json");
      case "refusal":
        return result(
          params,
          this.opts,
          JSON.stringify({
            summary: "No puedo ayudar con eso.",
            observations: [],
            educationalNote: "Contenido educativo únicamente.",
            warnings: ["Solicitud rechazada por política educativa."],
            usedKnowledgeIds: [],
            coverageAssessment: "limited",
          }),
        );
      case "invented_ids":
        return result(
          params,
          this.opts,
          JSON.stringify({
            summary: "Resumen educativo con ids inventados que deben filtrarse.",
            observations: [
              {
                kind: "definition",
                title: "Concepto",
                detail: "Detalle educativo.",
                knowledgeIds: ["gt_fake_invented_id", ...(this.opts.knownIds ?? []).slice(0, 1)],
              },
            ],
            educationalNote: "Nota educativa — no es asesoramiento.",
            warnings: [],
            usedKnowledgeIds: ["gt_fake_invented_id", "gt_another_fake", ...(this.opts.knownIds ?? []).slice(0, 1)],
            coverageAssessment: "medium",
          }),
        );
      case "banned_phrases":
        return result(
          params,
          this.opts,
          JSON.stringify({
            summary: "Te digo compra ahora BTC según el bookmap en vivo.",
            observations: [],
            educationalNote: "Nota.",
            warnings: [],
            usedKnowledgeIds: this.opts.knownIds?.slice(0, 1) ?? [],
            coverageAssessment: "limited",
          }),
        );
      case "success":
      default: {
        if (this.opts.outputText) return result(params, this.opts, this.opts.outputText);
        const ids = this.opts.knownIds ?? [];
        return result(
          params,
          this.opts,
          JSON.stringify({
            summary:
              "Respuesta educativa de prueba basada solo en la metodología recuperada. Sin mercado en vivo.",
            observations: ids.slice(0, 2).map((id) => ({
              kind: "principle",
              title: `Entrada ${id}`,
              detail: `Explicación educativa vinculada a ${id}.`,
              knowledgeIds: [id],
            })),
            educationalNote:
              "Respuesta educativa de Modo Mentor. No es asesoramiento financiero personalizado ni un análisis del mercado en vivo.",
            warnings: [],
            usedKnowledgeIds: ids.slice(0, 4),
            coverageAssessment: ids.length >= 3 ? "high" : ids.length > 0 ? "medium" : "limited",
          }),
        );
      }
    }
  }
}

function result(
  params: OpenAIResponsesCreateParams,
  opts: FakeOpenAIResponsesClientOptions,
  outputText: string,
): OpenAIResponsesCreateResult {
  return {
    outputText,
    model: opts.model ?? params.model,
    responseId: "fake_resp_test",
    usage: opts.usage ?? { inputTokens: 120, outputTokens: 80, totalTokens: 200 },
    status: "completed",
  };
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);
    const onAbort = () => {
      cleanup();
      reject(new OpenAIResponsesClientError("aborted", "Request aborted", { retryable: false }));
    };
    const cleanup = () => {
      clearTimeout(t);
      signal?.removeEventListener("abort", onAbort);
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
