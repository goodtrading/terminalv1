/**
 * AI-7.3.4 Knowledge Distillation client API — credentials:include only.
 */
import { apiUrl } from "@/lib/apiBase";

const BASE = "/api/internal/ai/knowledge-distillation";

async function kdFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(apiUrl(`${BASE}${path}`), {
    credentials: "include",
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(
      typeof body.message === "string"
        ? body.message
        : typeof body.code === "string"
          ? body.code
          : `HTTP ${res.status}`,
    );
  }
  return body as T;
}

export function fetchKdStatus() {
  return kdFetch<{
    enabled: boolean;
    mentorEligible: false;
    openAi: false;
    brainMutate: false;
    autoApply: false;
    note?: string;
  }>("/status");
}

export function runDistillation() {
  return kdFetch<{ result: unknown; mentorEligible: false; brainMutate: false; warning?: string }>("/run", {
    method: "POST",
    body: "{}",
  });
}

export function runStrictDistillation(body: {
  sourceSessionIds: string[];
  dryRun?: boolean;
  persist?: boolean;
  duplicatePolicy?: "REJECT" | "ALLOW_NEW_RUN";
}) {
  return kdFetch<{
    result: unknown;
    dryRun: boolean;
    sourceSessionIds: string[];
    fingerprint: string;
    preview?: { observationCount: number; humanSessionCount: number };
    mentorEligible: false;
    brainMutate: false;
  }>("/runs", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function fetchLatest() {
  return kdFetch<{ result: unknown; mentorEligible: false }>("/latest");
}

export function fetchHeatmaps() {
  return kdFetch<{ conflict: unknown; coverage: unknown; mentorEligible: false }>("/heatmaps");
}

export function fetchGaps() {
  return kdFetch<{ gaps: unknown[]; mentorEligible: false }>("/gaps");
}

export function fetchAdaptiveQueue() {
  return kdFetch<{ queue: unknown[]; mentorEligible: false }>("/adaptive-queue");
}

export function fetchChallenges() {
  return kdFetch<{ challenges: unknown[]; scores: unknown[]; neverAnswers: true; mentorEligible: false }>(
    "/challenges",
  );
}

export function fetchProposals() {
  return kdFetch<{
    proposals: unknown[];
    schemaWarning: string;
    safety: string;
    brainMutate: false;
    autoApply: false;
  }>("/proposals");
}

export function fetchEvolution() {
  return kdFetch<{ report: unknown; mentorEligible: false; brainMutated: false; openAi: false }>("/evolution");
}

export function fetchIndependentEvidenceAudit(sourceRunId?: string) {
  const q = sourceRunId ? `?sourceRunId=${encodeURIComponent(sourceRunId)}` : "";
  return kdFetch<{
    audit: unknown;
    mentorEligible: false;
    brainMutate: false;
    containsAnswerText: false;
  }>(`/independent-evidence-audit${q}`);
}

export function runIndependentEvidenceAudit(body?: { sourceRunId?: string }) {
  return kdFetch<{
    audit: unknown;
    persisted: boolean;
    persistError?: string;
    mentorEligible: false;
    brainMutate: false;
    originalRunUnchanged: true;
  }>("/independent-evidence-audit", {
    method: "POST",
    body: JSON.stringify(body ?? {}),
  });
}