/**
 * AI-7.3.5 Knowledge Evolution client API — credentials:include only.
 */
import { apiUrl } from "@/lib/apiBase";

const BASE = "/api/internal/ai/knowledge-evolution";

async function keFetch<T>(path: string, init?: RequestInit): Promise<T> {
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

export function fetchKeStatus() {
  return keFetch<{
    enabled: boolean;
    mentorEligible: false;
    openAi: false;
    brainMutate: false;
    autoApply: false;
    note?: string;
  }>("/status");
}

export function runEvolution() {
  return keFetch<{ result: unknown; mentorEligible: false; brainMutate: false }>("/run", {
    method: "POST",
    body: "{}",
  });
}

export function fetchLatest() {
  return keFetch<{ result: unknown }>("/latest");
}

export function fetchRules() {
  return keFetch<{ rules: unknown[] }>("/rules");
}

export function fetchDependencies() {
  return keFetch<{ graph: unknown }>("/dependencies");
}

export function fetchTimeline() {
  return keFetch<{ timeline: unknown[] }>("/timeline");
}

export function fetchVolatility() {
  return keFetch<{ volatilities: unknown[] }>("/volatility");
}

export function fetchStability() {
  return keFetch<{ stabilities: unknown[]; report: unknown }>("/stability");
}

export function fetchHealth() {
  return keFetch<{ health: unknown }>("/health");
}

export function fetchObsolete() {
  return keFetch<{ obsolete: unknown[]; neverDelete: true }>("/obsolete");
}

export function fetchKeystone() {
  return keFetch<{ keystones: unknown[] }>("/keystone");
}

export function fetchAdaptivePriority() {
  return keFetch<{ priority: unknown[] }>("/adaptive-priority");
}

export function fetchProposals() {
  return keFetch<{ proposals: unknown[]; autoApply: false; brainMutate: false }>("/proposals");
}

export function postFeedback() {
  return keFetch<{ health: unknown; brainMutate: false; autoApply: false }>("/feedback", {
    method: "POST",
    body: "{}",
  });
}