/**
 * AI-7.3.12 — In-memory append-only store for independent evidence audits.
 */
import type { IndependentEvidenceAudit } from "@shared/goodTradingAiIndependentEvidence";

class IndependentEvidenceAuditMemory {
  private audits = new Map<string, IndependentEvidenceAudit>();
  private order: string[] = [];

  /** Append-only: refuses overwrite of existing id. */
  saveAudit(audit: IndependentEvidenceAudit): string {
    if (this.audits.has(audit.id)) {
      throw new Error("AUDIT_APPEND_ONLY_REFUSES_OVERWRITE");
    }
    this.audits.set(audit.id, audit);
    this.order.push(audit.id);
    return audit.id;
  }

  getAudit(id: string): IndependentEvidenceAudit | null {
    return this.audits.get(id) ?? null;
  }

  listAuditIds(): string[] {
    return [...this.order];
  }

  listAuditsForRun(sourceRunId: string): IndependentEvidenceAudit[] {
    return this.order
      .map((id) => this.audits.get(id)!)
      .filter((a) => a.sourceRunId === sourceRunId);
  }

  latest(): IndependentEvidenceAudit | null {
    const id = this.order[this.order.length - 1];
    return id ? this.audits.get(id) ?? null : null;
  }
}

let singleton: IndependentEvidenceAuditMemory | null = null;

export function getIndependentEvidenceAuditMemory(): IndependentEvidenceAuditMemory {
  if (!singleton) singleton = new IndependentEvidenceAuditMemory();
  return singleton;
}

export function resetIndependentEvidenceAuditMemoryForTests(): void {
  singleton = new IndependentEvidenceAuditMemory();
}
