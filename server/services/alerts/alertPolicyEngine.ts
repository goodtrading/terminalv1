import {
  defaultAlertPreferences,
  isSeverityAtLeast,
  type AlertChannel,
  type AlertEvent,
  type AlertPreferences,
  type AlertRule,
} from "@shared/alerts";

export type AlertCandidate = Omit<
  AlertEvent,
  "id" | "createdAt" | "status" | "requiresAcknowledgement" | "schemaVersion" | "expiresAt"
> & {
  id?: string;
  expiresAt?: string;
  requiresAcknowledgement?: boolean;
};

export interface AlertPolicyState {
  lastEmittedAtByKey: Map<string, number>;
  activeApproachZones: Map<string, { level: number; enteredAt: number; armed: boolean }>;
  emittedInMinute: Map<string, number[]>;
}

export interface AlertPolicyDecision {
  allowed: boolean;
  reason?: string;
  event?: AlertEvent;
  channels: AlertChannel[];
}

export interface AlertPolicyOptions {
  now?: Date;
  environment?: "web" | "desktop" | "mobile" | "server";
  maxPerMinute?: number;
  maxPerDomainPerMinute?: number;
  staleSuppression?: boolean;
}

const DEFAULT_MAX_PER_MINUTE = 12;
const DEFAULT_MAX_PER_DOMAIN_PER_MINUTE = 5;
const REARM_DISTANCE_MULTIPLIER = 1.8;

export function createAlertPolicyState(): AlertPolicyState {
  return {
    lastEmittedAtByKey: new Map(),
    activeApproachZones: new Map(),
    emittedInMinute: new Map(),
  };
}

function pruneMinuteWindow(values: number[], nowMs: number): number[] {
  return values.filter((value) => nowMs - value < 60_000);
}

function sanitizeMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (key.toLowerCase().includes("secret") || key.toLowerCase().includes("token")) continue;
    if (typeof value === "string") out[key] = value.slice(0, 500);
    else if (typeof value === "number" || typeof value === "boolean" || value == null) out[key] = value;
    else out[key] = JSON.parse(JSON.stringify(value)).toString?.() === "[object Object]" ? value : String(value).slice(0, 500);
  }
  return out;
}

function isApproachingType(type: string): boolean {
  return type.endsWith("_approaching");
}

function isInQuietHours(preferences: AlertPreferences, now: Date): boolean {
  const quiet = preferences.quietHours;
  if (!quiet?.enabled) return false;
  const current = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  if (quiet.start <= quiet.end) return current >= quiet.start && current < quiet.end;
  return current >= quiet.start || current < quiet.end;
}

function proximityDistance(candidate: AlertCandidate): number | null {
  const raw = candidate.metadata.distance;
  return typeof raw === "number" && Number.isFinite(raw) ? Math.abs(raw) : null;
}

function proximityThreshold(candidate: AlertCandidate): number | null {
  const raw = candidate.metadata.threshold;
  return typeof raw === "number" && Number.isFinite(raw) && raw > 0 ? raw : null;
}

function shouldSuppressApproach(
  state: AlertPolicyState,
  candidate: AlertCandidate,
  nowMs: number,
): boolean {
  if (!isApproachingType(candidate.type)) return false;
  const distance = proximityDistance(candidate);
  const threshold = proximityThreshold(candidate);
  if (distance == null || threshold == null) return false;

  const zone = state.activeApproachZones.get(candidate.deduplicationKey);
  if (!zone) {
    state.activeApproachZones.set(candidate.deduplicationKey, {
      level: Number(candidate.metadata.level ?? 0),
      enteredAt: nowMs,
      armed: false,
    });
    return false;
  }

  if (distance > threshold * REARM_DISTANCE_MULTIPLIER) {
    state.activeApproachZones.set(candidate.deduplicationKey, {
      level: Number(candidate.metadata.level ?? 0),
      enteredAt: nowMs,
      armed: true,
    });
    return true;
  }

  return !zone.armed;
}

export function resolveAlertChannels(
  rule: AlertRule,
  preferences: AlertPreferences,
  severity: AlertEvent["severity"],
  environment: "web" | "desktop" | "mobile" | "server",
  now = new Date(),
): AlertChannel[] {
  const preferred = new Set(preferences.channelsBySeverity[severity] ?? rule.defaultChannels);
  if (severity === "P0") preferred.add("in_app");
  const quiet = severity !== "P0" && isInQuietHours(preferences, now);
  return Array.from(preferred).filter((channel) => {
    if (quiet && channel !== "in_app") return false;
    if (channel === "desktop_native") return environment === "desktop";
    if (channel === "mobile_push") return false;
    if (channel === "web_notification") return false;
    return true;
  });
}

export function evaluateAlertPolicy(
  state: AlertPolicyState,
  rule: AlertRule,
  candidate: AlertCandidate,
  preferences: AlertPreferences = defaultAlertPreferences(candidate.userId),
  options: AlertPolicyOptions = {},
): AlertPolicyDecision {
  const now = options.now ?? new Date();
  const nowMs = now.getTime();
  const environment = options.environment ?? "server";
  const severity = candidate.severity ?? rule.defaultSeverity;

  if (!preferences.enabled && severity !== "P0") return { allowed: false, reason: "preferences_disabled", channels: [] };
  if (!preferences.enabledDomains[rule.domain] && severity !== "P0") return { allowed: false, reason: "domain_disabled", channels: [] };
  if (preferences.disabledTypes.includes(rule.type) && severity !== "P0") return { allowed: false, reason: "type_disabled", channels: [] };
  if (!isSeverityAtLeast(severity, preferences.minSeverity) && severity !== "P0") {
    return { allowed: false, reason: "below_min_severity", channels: [] };
  }
  if (rule.desktopOnly && environment !== "desktop") {
    return { allowed: false, reason: "desktop_only", channels: [] };
  }
  if (candidate.metadata.staleSuppressed === true && severity !== "P0") {
    return { allowed: false, reason: "stale_suppressed", channels: [] };
  }
  if (candidate.metadata.sourceHealthy === false && severity !== "P0" && !candidate.type.includes("data_source")) {
    return { allowed: false, reason: "source_unhealthy", channels: [] };
  }

  const lastAt = state.lastEmittedAtByKey.get(candidate.deduplicationKey);
  if (!rule.bypassGlobalCooldown && lastAt && nowMs - lastAt < rule.cooldownMs) {
    return { allowed: false, reason: "cooldown", channels: [] };
  }
  if (!rule.bypassGlobalCooldown && shouldSuppressApproach(state, candidate, nowMs)) {
    return { allowed: false, reason: "approach_zone_not_rearmed", channels: [] };
  }

  const globalKey = candidate.userId ? `user:${candidate.userId}` : "global";
  const domainKey = `${globalKey}:domain:${candidate.domain}`;
  const globalWindow = pruneMinuteWindow(state.emittedInMinute.get(globalKey) ?? [], nowMs);
  const domainWindow = pruneMinuteWindow(state.emittedInMinute.get(domainKey) ?? [], nowMs);
  if (!rule.bypassGlobalCooldown && globalWindow.length >= (options.maxPerMinute ?? DEFAULT_MAX_PER_MINUTE)) {
    return { allowed: false, reason: "rate_limited_global", channels: [] };
  }
  if (!rule.bypassGlobalCooldown && domainWindow.length >= (options.maxPerDomainPerMinute ?? DEFAULT_MAX_PER_DOMAIN_PER_MINUTE)) {
    return { allowed: false, reason: "rate_limited_domain", channels: [] };
  }

  const channels = resolveAlertChannels(rule, preferences, severity, environment, now);
  if (channels.length === 0) return { allowed: false, reason: "no_channels", channels: [] };

  const createdAt = now.toISOString();
  const expiresAt =
    candidate.expiresAt ??
    (rule.expiresAfterMs ? new Date(nowMs + rule.expiresAfterMs).toISOString() : undefined);
  const event: AlertEvent = {
    ...candidate,
    id: candidate.id ?? `${candidate.type}:${candidate.deduplicationKey}:${nowMs}`,
    severity,
    createdAt,
    expiresAt,
    requiresAcknowledgement: candidate.requiresAcknowledgement ?? rule.requiresAcknowledgement,
    status: "new",
    metadata: sanitizeMetadata(candidate.metadata),
    schemaVersion: 1,
  };

  state.lastEmittedAtByKey.set(candidate.deduplicationKey, nowMs);
  state.emittedInMinute.set(globalKey, [...globalWindow, nowMs]);
  state.emittedInMinute.set(domainKey, [...domainWindow, nowMs]);
  if (isApproachingType(candidate.type)) {
    const zone = state.activeApproachZones.get(candidate.deduplicationKey);
    if (zone) state.activeApproachZones.set(candidate.deduplicationKey, { ...zone, armed: false });
  }

  return { allowed: true, event, channels };
}
