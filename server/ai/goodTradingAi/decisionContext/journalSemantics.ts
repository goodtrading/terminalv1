/**
 * AI-8.1.1 — Factual close classification for Decision Journal / timeline.
 * STOP/TP require classificationConfidence + evidence codes; never invent MANUAL_CLOSE.
 */
import type { DecisionTimelineEventType } from "@shared/goodTradingAiDecisionContext";
import type { PositionEventForDecision } from "@shared/goodTradingAiDecisionContext";

export type CloseClassification = {
  timelineType: DecisionTimelineEventType;
  howItEnded: string;
  classificationConfidence: "HIGH" | "MEDIUM" | "LOW" | "NONE";
  evidenceCodes: string[];
};

const STOP_EVIDENCE = ["EVIDENCE_STOP_KEYWORD", "EVIDENCE_STOP_ORDER_HINT"] as const;
const TP_EVIDENCE = ["EVIDENCE_TP_KEYWORD", "EVIDENCE_TP_ORDER_HINT"] as const;

/**
 * Map position event → timeline type with conservative close semantics.
 * MANUAL_CLOSE is never invented from weak text hints.
 */
export function classifyPositionTimelineEvent(
  type: PositionEventForDecision,
  hint?: string | null,
  opts?: { hasStopOrderEvidence?: boolean; hasTpOrderEvidence?: boolean },
): CloseClassification {
  const h = (hint ?? "").toUpperCase();

  if (type === "POSITION_OPENED") {
    return {
      timelineType: "OPEN",
      howItEnded: "",
      classificationConfidence: "HIGH",
      evidenceCodes: ["EVIDENCE_POSITION_OPENED"],
    };
  }
  if (type === "POSITION_INCREASED") {
    return {
      timelineType: "ADD",
      howItEnded: "",
      classificationConfidence: "HIGH",
      evidenceCodes: ["EVIDENCE_POSITION_INCREASED"],
    };
  }
  if (type === "POSITION_REDUCED") {
    const partial = h.includes("PARTIAL");
    return {
      timelineType: partial ? "PARTIAL" : "REDUCE",
      howItEnded: "",
      classificationConfidence: "HIGH",
      evidenceCodes: partial
        ? ["EVIDENCE_POSITION_REDUCED", "EVIDENCE_PARTIAL_HINT"]
        : ["EVIDENCE_POSITION_REDUCED"],
    };
  }

  // POSITION_CLOSED — require evidence for STOP/TP; never invent MANUAL_CLOSE
  const evidenceCodes: string[] = ["EVIDENCE_POSITION_CLOSED"];
  const stopKeyword = /\bSTOP\b/.test(h) || h.includes("STOP_LOSS") || h.includes("STOP LOSS");
  const tpKeyword =
    /\bTP\b/.test(h) ||
    h.includes("TAKE_PROFIT") ||
    h.includes("TAKE PROFIT") ||
    h.includes("TAKEPROFIT");

  if (stopKeyword) evidenceCodes.push(STOP_EVIDENCE[0]);
  if (opts?.hasStopOrderEvidence) evidenceCodes.push(STOP_EVIDENCE[1]);
  if (tpKeyword) evidenceCodes.push(TP_EVIDENCE[0]);
  if (opts?.hasTpOrderEvidence) evidenceCodes.push(TP_EVIDENCE[1]);

  const stopScore =
    (stopKeyword ? 1 : 0) + (opts?.hasStopOrderEvidence ? 1 : 0);
  const tpScore = (tpKeyword ? 1 : 0) + (opts?.hasTpOrderEvidence ? 1 : 0);

  if (stopScore >= 2) {
    return {
      timelineType: "STOP_HIT",
      howItEnded: `STOP_HIT: ${(hint ?? "stop").slice(0, 240)}`,
      classificationConfidence: "HIGH",
      evidenceCodes,
    };
  }
  if (tpScore >= 2) {
    return {
      timelineType: "TP_HIT",
      howItEnded: `TP_HIT: ${(hint ?? "tp").slice(0, 240)}`,
      classificationConfidence: "HIGH",
      evidenceCodes,
    };
  }
  if (stopScore === 1) {
    return {
      timelineType: "EXIT",
      howItEnded: `UNCERTAIN: possible stop — ${(hint ?? "").slice(0, 220)}`,
      classificationConfidence: "LOW",
      evidenceCodes: [...evidenceCodes, "CLASSIFICATION_UNCERTAIN"],
    };
  }
  if (tpScore === 1) {
    return {
      timelineType: "EXIT",
      howItEnded: `UNCERTAIN: possible take-profit — ${(hint ?? "").slice(0, 200)}`,
      classificationConfidence: "LOW",
      evidenceCodes: [...evidenceCodes, "CLASSIFICATION_UNCERTAIN"],
    };
  }

  return {
    timelineType: "EXIT",
    howItEnded: `POSITION_CLOSED: ${(hint ?? "closed").slice(0, 240)}`,
    classificationConfidence: "MEDIUM",
    evidenceCodes,
  };
}
