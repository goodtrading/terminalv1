/**
 * AI-7.3.13 — In-memory CrossCaseValidationAudit store (tests + non-durable fallback).
 */
import type { CrossCaseValidationAudit } from "@shared/goodTradingAiCrossCaseValidation";

let audits: CrossCaseValidationAudit[] = [];

export function getCrossCaseValidationAuditMemory() {
  return {
    saveAudit(audit: CrossCaseValidationAudit): CrossCaseValidationAudit {
      if (audits.some((a) => a.id === audit.id)) {
        throw new Error("AUDIT_APPEND_ONLY_REFUSES_OVERWRITE");
      }
      audits.push(audit);
      return audit;
    },
    listAudits(sourceRunId?: string): CrossCaseValidationAudit[] {
      return sourceRunId ? audits.filter((a) => a.sourceRunId === sourceRunId) : [...audits];
    },
    getAudit(id: string): CrossCaseValidationAudit | null {
      return audits.find((a) => a.id === id) ?? null;
    },
  };
}

export function resetCrossCaseValidationAuditMemoryForTests(): void {
  audits = [];
}
