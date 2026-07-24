/**
 * AI-7.3.13 — Generate 5 neutral DISTINCT cross-case questions from IE audit challenges.
 * Never embeds prior answers, engine hypotheses, or leading confirmation wording.
 */
import type { ChallengeItem } from "@shared/goodTradingAiKnowledgeDistillation";
import type { IndependentEvidenceAudit } from "@shared/goodTradingAiIndependentEvidence";
import {
  CROSS_CASE_QUESTION_CAP,
  crossCaseHypothesisSchema,
  crossCaseQuestionDraftSchema,
  type CrossCaseHypothesis,
  type CrossCaseQuestionDraft,
  type NeutralityClass,
} from "@shared/goodTradingAiCrossCaseValidation";
import type { CalibrationQuestion } from "@shared/goodTradingAiCriticalCalibration";
import { calibrationQuestionSchema } from "@shared/goodTradingAiCriticalCalibration";
import { auditQuestionNeutrality } from "./neutrality";

const DEFAULT_SCORE = {
  uncertaintyScore: 0.8,
  coverageGain: 0.7,
  ruleImpact: 0.7,
  templateImpact: 0.5,
  conflictResolutionValue: 0.75,
  novelty: 0.9,
  redundancyPenalty: 0.1,
  humanEffortPenalty: 0.2,
  safetyPriority: 0.85,
} as const;

/** Fixed mapping: challenge → hypothesis kind (distribution required by AI-7.3.13). */
const KIND_BY_CHALLENGE_ORDER = [
  "INVALIDATION",
  "LENS_PRIORITY",
  "MIN_CONFIRMATION",
  "CONFLICT_RESOLUTION",
  "SCOPE_COUNTEREXAMPLE",
] as const;

type ScenarioSpec = {
  questionType: CalibrationQuestion["questionType"];
  lenses: CrossCaseQuestionDraft["relatedLenses"];
  facts: string[];
  dimensions: string[];
  prompt: string;
  claim: string;
  why: string;
  concepts: string[];
};

function scenarioFor(
  kind: (typeof KIND_BY_CHALLENGE_ORDER)[number],
  challenge: ChallengeItem,
): ScenarioSpec {
  const lenses = (challenge.relatedLenses?.length
    ? challenge.relatedLenses
    : (["INVALIDATION"] as const)) as ScenarioSpec["lenses"];

  switch (kind) {
    case "LENS_PRIORITY":
      return {
        questionType: "CONDITIONAL_PRIORITY",
        lenses: lenses.slice(0, 2) as ScenarioSpec["lenses"],
        facts: [
          "Régimen: baja volatilidad sostenida (no el caso de alta vol previo).",
          "Escala: primer toque de sesión en un nivel (no retest inmediato).",
          "Wall behavior: liquidez visible se retira parcialmente sin spoofing marcado.",
          "Aceptación: el precio acepta el nivel una vez; no hay rechazo limpio posterior.",
        ],
        dimensions: ["régimen", "wall behavior", "escala", "aceptación"],
        prompt:
          "En baja volatilidad, la liquidez visible en un nivel se retira parcialmente mientras el precio acepta ese nivel por primera vez en la sesión (sin spoofing marcado). ¿Qué evidencia necesitás para decidir qué lente pesa más entre las presentes — o si la prioridad depende de otra condición?",
        claim: "Priority between ACCEPTANCE and LIQUIDITY may be conditional, not absolute.",
        why: "Cross-case check of lens priority under a distinct low-vol / first-touch regime.",
        concepts: ["lens-priority", "acceptance", "liquidity"],
      };
    case "MIN_CONFIRMATION":
      return {
        questionType: "CONFIRMATION_REQUIREMENT",
        lenses: (lenses.includes("ABSORPTION")
          ? lenses
          : (["ABSORPTION", "ACCEPTANCE", "CVD"] as const)) as ScenarioSpec["lenses"],
        facts: [
          "Agresión compradora con absorción aparente en la zona.",
          "Precio recupera la zona y vuelve a perderla sin aceptación.",
          "CVD no confirma la absorción.",
          "Persistencia: el patrón dura menos de un ciclo de rotación local.",
        ],
        dimensions: ["aceptación/rechazo", "CVD", "persistencia"],
        prompt:
          "Hay agresión compradora y absorción aparente, pero el precio recupera la zona y vuelve a perderla sin aceptación; CVD no acompaña el movimiento. ¿Qué evidencia mínima exigís para considerar que la absorción sigue siendo válida — o qué la deja sin peso?",
        claim: "Absorption readings require minimum confirmations beyond the first print.",
        why: "Cross-case minimum-confirmation probe with failed acceptance + absent CVD.",
        concepts: ["absorption", "confirmation", "acceptance"],
      };
    case "INVALIDATION":
      return {
        questionType: "INVALIDATION_REQUIREMENT",
        lenses: ["INVALIDATION", "STALENESS", "OI"] as ScenarioSpec["lenses"],
        facts: [
          "OI se colapsa de forma abrupta.",
          "Contexto de lentes está stale / desactualizado.",
          "No hay Market Snapshot live — solo hechos sintéticos del escenario.",
          "Invalidation state: varios lentes conflictúan sin resolución previa.",
        ],
        dimensions: ["OI", "staleness", "invalidation state"],
        prompt:
          "OI se colapsa y el contexto de lentes está stale, con conflictos sin resolver. ¿Qué stack de invalidación (ordenado) forzaría abandonar el marco metodológico actual por completo, frente a solo bajar confianza?",
        claim: "A full invalidation stack can force frame abandonment vs confidence downgrade.",
        why: "Cross-case full-invalidation probe under OI collapse + staleness.",
        concepts: ["invalidation-stack", "staleness", "oi"],
      };
    case "CONFLICT_RESOLUTION":
      return {
        questionType: "CONFLICT_RESOLUTION",
        lenses: (lenses.length >= 2
          ? lenses
          : (["LIQUIDITY", "REJECTION"] as const)) as ScenarioSpec["lenses"],
        facts: [
          "Una pared de liquidez persiste en el book (persistencia alta).",
          "El precio ya rechazó ese nivel dos veces con rechazo limpio.",
          "Provenance: ambas lecturas vienen del mismo escenario sintético, no de addenda.",
          "No hay spoofing explícito declarado.",
        ],
        dimensions: ["persistencia", "provenance", "rechazo"],
        prompt:
          "Una pared de liquidez persiste en el book, pero el precio ya rechazó ese nivel dos veces con rechazo limpio. Las lecturas de liquidez y rechazo divergen. ¿Cómo resolvés el conflicto, y qué condición cambiaría el orden de prioridad?",
        claim: "Liquidity persistence vs clean rejection conflict needs an explicit resolution rule.",
        why: "Cross-case conflict resolution under persistent wall + repeated rejection.",
        concepts: ["conflict-resolution", "liquidity", "rejection"],
      };
    case "SCOPE_COUNTEREXAMPLE":
      return {
        questionType: "COUNTEREXAMPLE",
        lenses: (lenses.length >= 2
          ? lenses
          : (["ACCEPTANCE", "REJECTION"] as const)) as ScenarioSpec["lenses"],
        facts: [
          "Escala local: aceptación de un micro-nivel.",
          "Escala de sesión: rechazo estructural del rango.",
          "Invalidation state: la invalidación local no coincide con la de sesión.",
          "Régimen: transición de rango a expansión (no el régimen del caso original).",
        ],
        dimensions: ["escala global/local", "invalidation state", "régimen"],
        prompt:
          "A escala local hay aceptación de un micro-nivel, pero a escala de sesión hay rechazo estructural del rango. ¿En qué alcance aplica cada lectura, y hay un contraejemplo metodológico donde esa asignación de alcance falla?",
        claim: "Acceptance vs rejection scope may differ by local vs session scale.",
        why: "Cross-case scope/counterexample under local acceptance vs session rejection.",
        concepts: ["scope", "acceptance", "rejection", "counterexample"],
      };
  }
}

export function buildHypothesesFromChallenges(input: {
  challengeIds: string[];
  challenges: ChallengeItem[];
}): CrossCaseHypothesis[] {
  const out: CrossCaseHypothesis[] = [];
  for (let i = 0; i < Math.min(CROSS_CASE_QUESTION_CAP, input.challengeIds.length); i++) {
    const id = input.challengeIds[i]!;
    const ch = input.challenges.find((c) => c.id === id);
    if (!ch) continue;
    const kind = KIND_BY_CHALLENGE_ORDER[i]!;
    const spec = scenarioFor(kind, ch);
    out.push(
      crossCaseHypothesisSchema.parse({
        id: `hyp_cc_${String(i + 1).padStart(2, "0")}`,
        kind,
        sourceChallengeId: id,
        relatedLenses: spec.lenses.slice(0, 6),
        internalClaim: spec.claim,
        mentorEligible: false,
      }),
    );
  }
  return out;
}

export function generateCrossCaseQuestions(input: {
  audit: Pick<IndependentEvidenceAudit, "id" | "challengeAudit">;
  challenges: ChallengeItem[];
  priorPrompts?: string[];
}): {
  hypotheses: CrossCaseHypothesis[];
  drafts: CrossCaseQuestionDraft[];
  calibrationQuestions: CalibrationQuestion[];
  rejected: Array<{ questionId: string; class: NeutralityClass; reason: string }>;
} {
  const challengeIds = input.audit.challengeAudit.challengeIds.slice(0, CROSS_CASE_QUESTION_CAP);
  const hypotheses = buildHypothesesFromChallenges({
    challengeIds,
    challenges: input.challenges,
  });
  const drafts: CrossCaseQuestionDraft[] = [];
  const rejected: Array<{ questionId: string; class: NeutralityClass; reason: string }> = [];
  const calibrationQuestions: CalibrationQuestion[] = [];

  for (let i = 0; i < hypotheses.length; i++) {
    const hyp = hypotheses[i]!;
    const ch = input.challenges.find((c) => c.id === hyp.sourceChallengeId)!;
    const spec = scenarioFor(hyp.kind, ch);
    const questionId = `cq_cc13_${hyp.kind.toLowerCase()}_${i + 1}`;
    const draftCandidate = {
      questionId,
      questionType: spec.questionType,
      prompt: spec.prompt,
      scenarioFacts: spec.facts,
      relatedLenses: spec.lenses.slice(0, 6),
      targetHypothesisId: hyp.id,
      sourceChallengeId: hyp.sourceChallengeId,
      sourceAuditId: input.audit.id,
      relationToOriginal: "DISTINCT" as const,
      variedDimensions: spec.dimensions.slice(0, 8),
      allowsDepends: true as const,
      allowsConditions: true as const,
      confidenceOptions: ["LOW", "MEDIUM", "HIGH"] as ["LOW", "MEDIUM", "HIGH"],
      neutralityClass: "BLIND_SAFE" as NeutralityClass,
      mentorEligible: false as const,
    };
    const neut = auditQuestionNeutrality({
      prompt: draftCandidate.prompt,
      priorPrompts: input.priorPrompts ?? [],
      challengePrompt: typeof ch.prompt === "string" ? ch.prompt : "",
      relationToOriginal: draftCandidate.relationToOriginal,
    });
    if (neut.class !== "BLIND_SAFE") {
      rejected.push({ questionId, class: neut.class, reason: neut.reason });
      continue;
    }
    const draft = crossCaseQuestionDraftSchema.parse({
      ...draftCandidate,
      neutralityClass: "BLIND_SAFE",
    });
    drafts.push(draft);

    // Embed scenario facts in prompt body for the blind UI (no separate leaky fields).
    const promptWithFacts = `${spec.prompt}\n\nHechos del escenario:\n- ${spec.facts.join("\n- ")}`;
    calibrationQuestions.push(
      calibrationQuestionSchema.parse({
        id: questionId,
        prompt: promptWithFacts.slice(0, 800),
        questionType: spec.questionType,
        relatedLenses: spec.lenses.slice(0, 6),
        infoGainScore: 0.82,
        scoreComponents: { ...DEFAULT_SCORE },
        expectedInformationGainBand: "HIGH",
        whyThisQuestion: spec.why,
        affectedConcepts: spec.concepts,
        affectedTemplates: ["methodology-conditional"],
        rationale: "AI-7.3.13 cross-case validation; blind until submit.",
        allowsDepends: true,
        mentorEligible: false,
      }),
    );
  }

  if (drafts.length !== CROSS_CASE_QUESTION_CAP) {
    throw new Error(
      `CROSS_CASE_QUESTION_CAP_FAILED:${drafts.length}:${JSON.stringify(rejected)}`,
    );
  }

  // Max 2 questions sharing the same lens pair
  const pairCounts = new Map<string, number>();
  for (const d of drafts) {
    const pair = [...d.relatedLenses].slice(0, 2).sort().join("|");
    pairCounts.set(pair, (pairCounts.get(pair) ?? 0) + 1);
    if ((pairCounts.get(pair) ?? 0) > 2) throw new Error("LENS_PAIR_OVERUSE");
  }

  return { hypotheses, drafts, calibrationQuestions, rejected };
}

/** Strip fields forbidden in blind packets. */
export function toBlindSafePacket(q: CalibrationQuestion, sessionId: string) {
  return {
    sessionId,
    questionId: q.id,
    prompt: q.prompt,
    questionType: q.questionType,
    relatedLenses: q.relatedLenses,
    allowsDepends: true as const,
    confidenceOptions: ["LOW", "MEDIUM", "HIGH"] as const,
    mentorEligible: false as const,
  };
}

export function assertNoForbiddenBlindFields(packet: Record<string, unknown>): void {
  const forbidden = [
    "previousHumanAnswer",
    "expectedAnswer",
    "enginePreference",
    "engineOutcome",
    "proposal",
    "targetHypothesis",
    "targetHypothesisId",
    "targetDirection",
    "agreement",
    "supportCount",
    "infoGainScore",
    "auditConclusion",
    "pass",
    "fail",
    "comparison",
  ];
  for (const k of forbidden) {
    if (k in packet) throw new Error(`BLIND_PACKET_LEAK:${k}`);
  }
  const blob = JSON.stringify(packet).toLowerCase();
  if (blob.includes("previoushumananswer") || blob.includes("expectedanswer")) {
    throw new Error("BLIND_PACKET_LEAK:answer_fields");
  }
}
