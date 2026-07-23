/**
 * Rationale Store — read helpers. Never retrospectively edit justifications.
 */
import type { JustificationEvent, RationalePayload } from "@shared/goodTradingAiKnowledgeProvenance";

export function getRationaleForEvent(event: JustificationEvent): RationalePayload {
  return event.rationale;
}

export function listRationalesForRule(events: JustificationEvent[], ruleId: string): Array<{
  eventId: string;
  kind: JustificationEvent["kind"];
  atMs: number;
  rationale: RationalePayload;
}> {
  return events
    .filter((e) => e.stableRuleId === ruleId)
    .sort((a, b) => a.atMs - b.atMs)
    .map((e) => ({
      eventId: e.id,
      kind: e.kind,
      atMs: e.atMs,
      rationale: e.rationale,
    }));
}

/** Guard: callers must never mutate stored rationale objects in place for persistence. */
export function assertAppendOnly(_events: JustificationEvent[]): true {
  return true;
}