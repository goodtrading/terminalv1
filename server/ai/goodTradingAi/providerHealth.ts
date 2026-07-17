/**
 * In-memory Mentors provider health (no paid calls).
 * Used by GET /api/internal/ai/provider/status.
 */

export type ProviderErrorCategory =
  | "none"
  | "OPENAI_AUTH_ERROR"
  | "OPENAI_RATE_LIMITED"
  | "OPENAI_TIMEOUT"
  | "OPENAI_BAD_RESPONSE"
  | "OPENAI_UNAVAILABLE"
  | "PROVIDER_CONFIGURATION_ERROR"
  | "PROVIDER_ERROR"
  | "PROVIDER_TIMEOUT"
  | "OTHER";

type HealthState = {
  lastSuccessAt: string | null;
  lastErrorCategory: ProviderErrorCategory | null;
  lastErrorAt: string | null;
  lastProvider: string | null;
  lastModel: string | null;
};

const state: HealthState = {
  lastSuccessAt: null,
  lastErrorCategory: null,
  lastErrorAt: null,
  lastProvider: null,
  lastModel: null,
};

export function recordProviderSuccess(meta: { provider: string; model: string }): void {
  state.lastSuccessAt = new Date().toISOString();
  state.lastProvider = meta.provider;
  state.lastModel = meta.model;
  state.lastErrorCategory = null;
}

export function recordProviderFailure(meta: {
  provider: string;
  model?: string;
  category: ProviderErrorCategory;
}): void {
  state.lastErrorAt = new Date().toISOString();
  state.lastErrorCategory = meta.category;
  state.lastProvider = meta.provider;
  if (meta.model) state.lastModel = meta.model;
}

export function getProviderHealthSnapshot(): HealthState {
  return { ...state };
}

/** Test helper */
export function resetProviderHealthForTests(): void {
  state.lastSuccessAt = null;
  state.lastErrorCategory = null;
  state.lastErrorAt = null;
  state.lastProvider = null;
  state.lastModel = null;
}
