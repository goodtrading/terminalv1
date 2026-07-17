import { apiUrl } from "../../lib/apiBase";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatTerminalTime } from "@/lib/timezone";
import { useTimezonePreference } from "@/hooks/useTimezonePreference";
import {
  MENTOR_MESSAGE_MAX,
  SAFE_AI_ERROR_MESSAGES,
  type GoodTradingAIChatResponse,
  type GoodTradingAIErrorCode,
} from "@shared/goodTradingAi";
import {
  MentorStructuredMessage,
  type StructuredAssistant,
} from "./MentorStructuredMessage";

export { MentorStructuredMessage } from "./MentorStructuredMessage";

type ChatRole = "user" | "assistant";

type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  timestamp: number;
  structured?: StructuredAssistant;
};

const AI_ERROR_CODES = new Set<string>([
  "AI_DISABLED",
  "UNAUTHENTICATED",
  "UNAUTHORIZED",
  "INVALID_REQUEST",
  "MODE_NOT_AVAILABLE",
  "RATE_LIMITED",
  "PROVIDER_TIMEOUT",
  "PROVIDER_ERROR",
  "OPENAI_AUTH_ERROR",
  "OPENAI_RATE_LIMITED",
  "OPENAI_TIMEOUT",
  "OPENAI_BAD_RESPONSE",
  "OPENAI_UNAVAILABLE",
  "PROVIDER_CONFIGURATION_ERROR",
]);

function providerLabel(provider?: GoodTradingAIChatResponse["provider"]): string {
  if (!provider) return "Mentor";
  if (provider.mocked) return "Mentor · mock";
  if (provider.id === "openai") return "Mentor · OpenAI";
  return `Mentor · ${provider.id}`;
}

function makeId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `msg_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
}

function mapErrorCode(code: string | undefined): GoodTradingAIErrorCode | "AI_CHAT_ERROR" {
  if (!code) return "AI_CHAT_ERROR";
  if (code === "UNAUTHORIZED" || code === "INVALID_TOKEN") return "UNAUTHENTICATED";
  if (AI_ERROR_CODES.has(code) && code !== "UNAUTHORIZED") {
    return code as GoodTradingAIErrorCode;
  }
  return "AI_CHAT_ERROR";
}

function friendlyErrorMessage(code: string | undefined, fallback?: string): string {
  const mapped = mapErrorCode(code);
  if (mapped !== "AI_CHAT_ERROR" && mapped in SAFE_AI_ERROR_MESSAGES) {
    return SAFE_AI_ERROR_MESSAGES[mapped as GoodTradingAIErrorCode];
  }
  return fallback?.trim() || "No se pudo completar la solicitud de AI.";
}

async function fetchGoodTradingAiEnabled(signal?: AbortSignal): Promise<boolean> {
  try {
    const res = await fetch(apiUrl("/api/runtime/features"), {
      credentials: "include",
      signal,
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { goodTradingAiEnabled?: unknown };
    return data.goodTradingAiEnabled === true;
  } catch {
    return false;
  }
}

export function AIChatPanel() {
  useTimezonePreference();
  const MAX_MESSAGES = 30;
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorState, setErrorState] = useState<{ code?: string; message?: string } | null>(null);
  const [lastProvider, setLastProvider] = useState<GoodTradingAIChatResponse["provider"] | null>(null);

  const listRef = useRef<HTMLDivElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    void fetchGoodTradingAiEnabled(ac.signal).then((on) => {
      if (!ac.signal.aborted) setEnabled(on);
    });
    return () => ac.abort();
  }, []);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, isLoading]);

  const trimmedDraft = draft.trim();
  const overMax = draft.length > MENTOR_MESSAGE_MAX;
  const canSend = useMemo(
    () => trimmedDraft.length > 0 && !isLoading && !overMax && enabled === true,
    [trimmedDraft, isLoading, overMax, enabled],
  );

  const cancelInFlight = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsLoading(false);
  }, []);

  const sendMessage = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isLoading || enabled !== true) return;
    if (trimmed.length > MENTOR_MESSAGE_MAX) {
      setErrorState({
        code: "INVALID_REQUEST",
        message: `Máximo ${MENTOR_MESSAGE_MAX} caracteres.`,
      });
      return;
    }

    setErrorState(null);
    setIsLoading(true);

    const userMsg: ChatMessage = {
      id: makeId(),
      role: "user",
      content: trimmed,
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg].slice(-MAX_MESSAGES));
    if (trimmed === draft.trim()) setDraft("");

    const ac = new AbortController();
    abortRef.current = ac;

    try {
      const resp = await fetch(apiUrl("/api/ai/chat"), {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        signal: ac.signal,
        body: JSON.stringify({
          schemaVersion: "1.0",
          mode: "mentor",
          message: trimmed,
        }),
      });

      const body = (await resp.json().catch(() => ({}))) as Record<string, unknown>;

      if (!resp.ok) {
        const code =
          (typeof body.code === "string" && body.code) ||
          (typeof body.error === "string" && body.error) ||
          undefined;
        const message =
          typeof body.message === "string" ? body.message : friendlyErrorMessage(code);
        throw Object.assign(new Error(message), { code, message });
      }

      const data = body as unknown as GoodTradingAIChatResponse;
      if (data.schemaVersion !== "1.0" || data.mode !== "mentor" || typeof data.summary !== "string") {
        throw Object.assign(new Error("Respuesta de AI inválida."), { code: "PROVIDER_ERROR" });
      }

      const structured: StructuredAssistant = {
        summary: data.summary,
        observations: Array.isArray(data.observations) ? data.observations : [],
        educationalNote: data.educationalNote || SAFE_AI_ERROR_MESSAGES.PROVIDER_ERROR,
        warnings: Array.isArray(data.warnings) ? data.warnings : [],
        provider: data.provider ?? { id: "mock", model: "unknown", mocked: true },
        requestId: data.requestId || "unknown",
        knowledgeReferences: Array.isArray(data.knowledgeReferences) ? data.knowledgeReferences : [],
        coverage: data.coverage,
      };
      setLastProvider(structured.provider);

      const assistantMsg: ChatMessage = {
        id: makeId(),
        role: "assistant",
        content: structured.summary,
        timestamp: Date.now(),
        structured,
      };
      setMessages((prev) => [...prev, assistantMsg].slice(-MAX_MESSAGES));
    } catch (e: unknown) {
      if (e instanceof DOMException && e.name === "AbortError") {
        return;
      }
      const code = typeof (e as { code?: string })?.code === "string" ? (e as { code: string }).code : undefined;
      const message = friendlyErrorMessage(
        code,
        e instanceof Error ? e.message : "AI request failed",
      );
      setErrorState({ code: mapErrorCode(code), message });
    } finally {
      if (abortRef.current === ac) abortRef.current = null;
      setIsLoading(false);
    }
  };

  if (enabled === null) {
    return (
      <div className="flex items-center justify-center h-full text-[11px] text-white/40 font-mono" role="status">
        Cargando GoodTrading AI…
      </div>
    );
  }

  if (!enabled) {
    return (
      <div
        className="flex flex-col gap-2 h-full min-h-0 p-3 text-[11px] text-white/50 font-mono"
        data-testid="ai-panel-disabled"
        role="status"
      >
        <div className="text-white/70 font-sans text-sm">GoodTrading AI</div>
        <p>
          Panel experimental deshabilitado. En el servidor:{" "}
          <span className="text-white/70">GOODTRADING_AI_ENABLED=true</span> y reiniciá.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 h-full min-h-0" data-testid="ai-mentor-panel">
      <div className="flex items-center justify-between gap-2 px-0.5">
        <div>
          <div className="text-[12px] font-semibold text-white/90">GoodTrading AI</div>
          <div className="text-[10px] text-emerald-200/80 font-mono" data-testid="mentor-mode-label">
            Modo {providerLabel(lastProvider ?? undefined)} · experimental
          </div>
        </div>
        <div className="text-[10px] font-mono text-white/40" aria-live="polite">
          {isLoading ? "Generando…" : `${messages.length} msgs`}
        </div>
      </div>

      <p className="text-[10px] text-white/45 leading-snug">
        Preguntas educativas sobre conceptos de la metodología (recuperación de conocimiento). Sin mercado en vivo,
        Bookmap ni ejecución automática. No es asesoramiento financiero personalizado.
      </p>

      <div
        ref={listRef}
        className="border border-white/10 rounded bg-black/20 overflow-y-auto flex-1 min-h-0"
        role="log"
        aria-label="Conversación Mentor"
      >
        <div className="p-2 flex flex-col gap-2">
          {messages.length === 0 ? (
            <div className="text-[10px] text-white/40 font-mono leading-snug">
              Ejemplos: ¿qué es Gamma?, Global Flip, Call Wall, Absorption, Sweep vs Reclaim, gestión de riesgo…
            </div>
          ) : null}

          {messages.map((m) => (
            <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              {m.role === "user" ? (
                <div className="max-w-[92%] whitespace-pre-wrap break-words rounded px-2 py-1 border border-white/15 bg-white/5 text-white/90">
                  <div className="text-[9px] text-white/40 font-mono mb-0.5">
                    VOS · {formatTerminalTime(m.timestamp)}
                  </div>
                  <div className="text-[11px] leading-snug">{m.content}</div>
                </div>
              ) : m.structured ? (
                <MentorStructuredMessage structured={m.structured} timestamp={m.timestamp} />
              ) : (
                <div className="max-w-[92%] text-[11px] text-white/70">{m.content}</div>
              )}
            </div>
          ))}

          {errorState ? (
            <div className="text-[10px] text-red-300 font-mono flex flex-col gap-1" role="alert" data-testid="mentor-error">
              <div>Error: {errorState.code ?? "AI_CHAT_ERROR"}</div>
              {errorState.message ? <div className="whitespace-pre-wrap text-white/70">{errorState.message}</div> : null}
            </div>
          ) : null}
        </div>
      </div>

      <div className="flex gap-2 items-end">
        <div className="flex flex-col gap-1 flex-1 min-w-0">
          <label className="sr-only" htmlFor="gt-ai-mentor-input">
            Pregunta educativa Modo Mentor
          </label>
          <textarea
            id="gt-ai-mentor-input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Preguntá un concepto (Gamma, Flip, Absorption…)"
            rows={3}
            maxLength={MENTOR_MESSAGE_MAX + 50}
            className="flex-1 resize-none border border-white/10 bg-black/20 rounded px-2 py-1 text-[11px] text-white/80 outline-none focus:border-white/20"
            disabled={isLoading}
            aria-invalid={overMax}
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                e.preventDefault();
                if (canSend) void sendMessage(draft);
              }
            }}
          />
          <div className="text-[9px] font-mono text-white/35 flex justify-between">
            <span>
              {draft.length}/{MENTOR_MESSAGE_MAX}
              {overMax ? " — demasiado largo" : ""}
            </span>
            <span>Ctrl/Cmd+Enter envía</span>
          </div>
        </div>
        <div className="flex flex-col gap-1">
          {isLoading ? (
            <button
              type="button"
              className="px-3 py-2 rounded border border-white/20 bg-white/5 text-white/70 text-[11px]"
              onClick={cancelInFlight}
            >
              Cancelar
            </button>
          ) : null}
          <button
            type="button"
            className={`px-3 py-2 rounded border text-[11px] font-bold transition-colors ${
              canSend ? "border-green-500/40 bg-green-500/15 text-green-200" : "border-white/10 bg-white/5 text-white/40"
            }`}
            onClick={() => void sendMessage(draft)}
            disabled={!canSend}
            aria-busy={isLoading}
          >
            <span className="inline-flex items-center gap-2">
              {isLoading ? (
                <span className="inline-block w-3 h-3 border border-white/30 border-t-white/60 rounded-full animate-spin" />
              ) : null}
              {isLoading ? "Enviando" : "Enviar"}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
