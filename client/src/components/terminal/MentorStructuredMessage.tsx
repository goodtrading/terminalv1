import React from "react";
import { formatTerminalTime } from "@/lib/timezone";
import type {
  GoodTradingAIChatResponse,
  GoodTradingAICoverage,
  GoodTradingAIKnowledgeReference,
  GoodTradingAIObservation,
  GoodTradingAIReasoning,
} from "@shared/goodTradingAi";

export type StructuredAssistant = {
  summary: string;
  observations: GoodTradingAIObservation[];
  educationalNote: string;
  warnings: string[];
  provider: GoodTradingAIChatResponse["provider"];
  requestId: string;
  knowledgeReferences?: GoodTradingAIKnowledgeReference[];
  coverage?: GoodTradingAICoverage;
  reasoning?: GoodTradingAIReasoning;
};

function coverageLabel(c?: GoodTradingAICoverage): string {
  if (c === "high") return "Alta";
  if (c === "medium") return "Media";
  return "Limitada";
}

const CIRCLED = ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨", "⑩"];

/** Presentational Mentor message bubble (also used by UI tests). */
export function MentorStructuredMessage({
  structured,
  timestamp,
}: {
  structured: StructuredAssistant;
  timestamp: number;
}) {
  const refs = structured.knowledgeReferences ?? [];
  const reasoning = structured.reasoning;
  return (
    <div
      className="max-w-[92%] whitespace-pre-wrap break-words rounded px-2 py-1 border border-white/10 bg-black/30 text-white/80"
      data-testid="mentor-assistant-message"
    >
      <div className="text-[9px] text-white/40 font-mono mb-0.5">
        GOODTRADING AI · MENTOR · {formatTerminalTime(timestamp)}
        {structured.provider.mocked ? " · MOCK" : structured.provider.id === "openai" ? " · OpenAI" : ""}
        {" · "}
        <span data-testid="mentor-coverage">Cobertura {coverageLabel(structured.coverage)}</span>
      </div>
      <div className="text-[11px] leading-snug mb-2" data-testid="mentor-summary">
        {structured.summary}
      </div>
      {structured.observations.length > 0 ? (
        <div
          className="border-t border-white/10 pt-2 mt-1 flex flex-col gap-2"
          data-testid="mentor-observations"
          aria-label="Observaciones educativas"
        >
          <div className="text-[9px] font-mono text-white/50 uppercase tracking-wide">Observaciones</div>
          {structured.observations.map((obs) => (
            <div key={obs.id} className="text-[11px] leading-snug" data-testid={`mentor-obs-${obs.id}`}>
              <div className="text-white/90 font-medium">{obs.title}</div>
              <div className="text-white/65">{obs.detail}</div>
            </div>
          ))}
        </div>
      ) : null}
      {reasoning && reasoning.steps.length > 0 ? (
        <div
          className="border-t border-white/10 pt-2 mt-2 flex flex-col gap-1.5"
          data-testid="mentor-reasoning"
          aria-label="Cómo razoné"
        >
          <div className="text-[9px] font-mono text-white/50 uppercase tracking-wide">
            Cómo razoné
          </div>
          {reasoning.steps.map((step, i) => (
            <div key={`${step.index}-${step.label}`} className="text-[11px] leading-snug" data-testid={`mentor-reason-step-${step.index}`}>
              <div className="text-white/85">
                <span className="font-mono text-emerald-200/80 mr-1">{CIRCLED[i] ?? `${step.index}.`}</span>
                {step.label}
              </div>
              <div className="text-white/60 pl-5">{step.detail}</div>
              {i < reasoning.steps.length - 1 ? (
                <div className="text-white/25 font-mono text-[10px] pl-2" aria-hidden>
                  ↓
                </div>
              ) : null}
            </div>
          ))}
          <div className="text-[11px] text-white/75 pt-1" data-testid="mentor-reasoning-conclusion">
            <span className="font-mono text-emerald-200/80 mr-1">★</span>
            Conclusión — {reasoning.conclusion}
          </div>
        </div>
      ) : null}
      {refs.length > 0 ? (
        <div
          className="border-t border-white/10 pt-2 mt-2"
          data-testid="mentor-methodology"
          aria-label="Metodología utilizada"
        >
          <div className="text-[9px] font-mono text-white/50 uppercase tracking-wide mb-1">
            Metodología utilizada
          </div>
          <ul className="flex flex-col gap-0.5 text-[10px] text-white/60 list-disc pl-4">
            {refs.map((r) => (
              <li key={r.id} data-testid={`mentor-ref-${r.id}`}>
                {r.title}{" "}
                <span className="text-white/35 font-mono">
                  ({r.category} · {r.kind})
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="border-t border-white/10 pt-2 mt-2 text-[10px] text-white/55" data-testid="mentor-educational-note">
        {structured.educationalNote}
      </div>
      {structured.warnings.length > 0 ? (
        <ul
          className="mt-2 flex flex-col gap-1 text-[10px] text-amber-200/90 list-disc pl-4"
          data-testid="mentor-warnings"
        >
          {structured.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      ) : null}
      <div className="mt-2 text-[9px] font-mono text-white/35">
        experimental · {structured.provider.id}/{structured.provider.model} · {structured.requestId.slice(0, 8)}
      </div>
    </div>
  );
}
