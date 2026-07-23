/**
 * AI-7.3.6 Knowledge Provenance client API — credentials:include only.
 */
import { apiUrl } from "@/lib/apiBase";

const BASE = "/api/internal/ai/knowledge-provenance";

async function kpFetch<T>(path: string, init?: RequestInit): Promise<T> {
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

export function fetchKpStatus() {
  return kpFetch<{
    enabled: boolean;
    mentorEligible: false;
    openAi: false;
    brainMutate: false;
    autoApply: false;
    note?: string;
  }>("/status");
}

export function runProvenance() {
  return kpFetch<{ result: unknown; brainMutate: false; autoApply: false }>("/run", {
    method: "POST",
    body: "{}",
  });
}

export function fetchLatest() {
  return kpFetch<{ result: unknown }>("/latest");
}

export function fetchRegistry() {
  return kpFetch<{ registry: unknown[] }>("/registry");
}

export function fetchTimeline(ruleId?: string) {
  const q = ruleId ? `?ruleId=${encodeURIComponent(ruleId)}` : "";
  return kpFetch<{ timeline?: unknown[]; timelines?: unknown }>(`/timeline${q}`);
}

export function fetchLineage() {
  return kpFetch<{ lineage: unknown }>("/lineage");
}

export function fetchRationale(ruleId: string) {
  return kpFetch<{ rationales: unknown[]; neverEdit: true }>(
    `/rationale?ruleId=${encodeURIComponent(ruleId)}`,
  );
}

export function fetchImpact(ruleId?: string) {
  const q = ruleId ? `?ruleId=${encodeURIComponent(ruleId)}` : "";
  return kpFetch<{ impact?: unknown; impactTraces?: unknown[] }>(`/impact${q}`);
}

export function fetchQuery(ruleId: string) {
  return kpFetch<{ result: unknown }>(`/query?ruleId=${encodeURIComponent(ruleId)}`);
}

export function fetchProposalContext() {
  return kpFetch<{ contexts: unknown[]; autoApply: false; brainMutate: false }>("/proposal-context");
}

export function fetchRelatedRules(ruleId: string) {
  return kpFetch<{ related: unknown[] }>(`/related-rules?ruleId=${encodeURIComponent(ruleId)}`);
}