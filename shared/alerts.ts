import { z } from "zod";

export const alertSeveritySchema = z.enum(["P0", "P1", "P2", "P3", "P4"]);
export type AlertSeverity = z.infer<typeof alertSeveritySchema>;

export const alertChannelSchema = z.enum([
  "in_app",
  "desktop_native",
  "web_notification",
  "mobile_push",
]);
export type AlertChannel = z.infer<typeof alertChannelSchema>;

export const alertStatusSchema = z.enum([
  "new",
  "delivered",
  "read",
  "acknowledged",
  "dismissed",
  "expired",
]);
export type AlertStatus = z.infer<typeof alertStatusSchema>;

export const alertDomainSchema = z.enum(["gamma", "market", "flow", "account", "system"]);
export type AlertDomain = z.infer<typeof alertDomainSchema>;

export const alertActionSchema = z.object({
  id: z.string().min(1).max(80),
  label: z.string().min(1).max(80),
  action: z.enum(["open_panel", "open_chart", "open_position", "acknowledge", "dismiss"]),
  payload: z.record(z.unknown()).optional(),
});
export type AlertAction = z.infer<typeof alertActionSchema>;

export const alertEventSchema = z.object({
  id: z.string().min(1).max(120),
  type: z.string().min(1).max(120),
  severity: alertSeveritySchema,
  domain: alertDomainSchema,
  symbol: z.string().min(1).max(32).optional(),
  title: z.string().min(1).max(160),
  message: z.string().min(1).max(800),
  shortMessage: z.string().max(240).optional(),
  createdAt: z.string().datetime(),
  detectedAt: z.string().datetime(),
  expiresAt: z.string().datetime().optional(),
  userId: z.string().max(80).optional(),
  source: z.string().min(1).max(120),
  deduplicationKey: z.string().min(1).max(220),
  correlationId: z.string().max(160).optional(),
  requiresAcknowledgement: z.boolean(),
  status: alertStatusSchema,
  metadata: z.record(z.unknown()),
  actions: z.array(alertActionSchema).max(8).optional(),
  schemaVersion: z.literal(1),
});
export type AlertEvent = z.infer<typeof alertEventSchema>;

export const alertRuleSchema = z.object({
  type: z.string().min(1).max(120),
  domain: alertDomainSchema,
  defaultSeverity: alertSeveritySchema,
  defaultChannels: z.array(alertChannelSchema),
  enabledByDefault: z.boolean(),
  cooldownMs: z.number().int().nonnegative(),
  expiresAfterMs: z.number().int().positive().optional(),
  requiresAcknowledgement: z.boolean(),
  bypassGlobalCooldown: z.boolean().default(false),
  desktopOnly: z.boolean().default(false),
  featureFlag: z.string().optional(),
});
export type AlertRule = z.infer<typeof alertRuleSchema>;

export const alertPreferencesSchema = z.object({
  userId: z.string().max(80).optional(),
  enabled: z.boolean(),
  minSeverity: alertSeveritySchema,
  enabledDomains: z.record(alertDomainSchema, z.boolean()),
  disabledTypes: z.array(z.string().max(120)),
  channelsBySeverity: z.record(alertSeveritySchema, z.array(alertChannelSchema)),
  soundBySeverity: z.record(alertSeveritySchema, z.boolean()),
  quietHours: z
    .object({
      enabled: z.boolean(),
      start: z.string().regex(/^\d{2}:\d{2}$/),
      end: z.string().regex(/^\d{2}:\d{2}$/),
      timezone: z.string().max(80),
    })
    .optional(),
  symbols: z.array(z.string().max(32)),
  proximity: z.object({
    mode: z.enum(["percent", "absolute", "volatility"]),
    percent: z.number().positive(),
    absolute: z.number().positive(),
    volatilityMultiplier: z.number().positive(),
  }),
  pnlThresholds: z.object({
    warningPct: z.number(),
    criticalPct: z.number(),
  }),
  marginThresholds: z.object({
    warningPct: z.number(),
    criticalPct: z.number(),
  }),
  allowBookmapAlerts: z.boolean(),
  desktopNativeWhenForeground: z.boolean(),
});
export type AlertPreferences = z.infer<typeof alertPreferencesSchema>;

export const alertDeliverySchema = z.object({
  id: z.string(),
  alertId: z.string(),
  userId: z.string().optional(),
  channel: alertChannelSchema,
  status: z.enum(["queued", "delivered", "failed", "suppressed"]),
  provider: z.enum(["in_app", "tauri_native", "web_notification", "mobile_push", "noop"]).default("noop"),
  deviceId: z.string().max(120).optional(),
  attemptedAt: z.string().datetime(),
  createdAt: z.string().datetime(),
  deliveredAt: z.string().datetime().optional(),
  failedAt: z.string().datetime().optional(),
  errorCode: z.string().max(80).optional(),
  error: z.string().max(240).optional(),
  retryCount: z.number().int().nonnegative().default(0),
});
export type AlertDelivery = z.infer<typeof alertDeliverySchema>;

export const alertHistoryEntrySchema = z.object({
  id: z.string(),
  alertId: z.string(),
  userId: z.string().optional(),
  action: z.enum([
    "created",
    "updated",
    "delivered",
    "delivery_failed",
    "read",
    "acknowledged",
    "dismissed",
    "expired",
    "suppressed",
  ]),
  at: z.string().datetime(),
  metadata: z.record(z.unknown()),
});
export type AlertHistoryEntry = z.infer<typeof alertHistoryEntrySchema>;

export interface AlertSourceHealth {
  source: string;
  healthy: boolean;
  stale: boolean;
  lastOkAt?: string;
  lastErrorAt?: string;
  reason?: string;
}

export interface AlertEvaluationContext {
  now: string;
  environment: "web" | "desktop" | "mobile" | "server";
  userId?: string;
  symbol?: string;
  sourceHealth: Record<string, AlertSourceHealth>;
  market?: Record<string, unknown>;
  previous?: Record<string, unknown>;
  preferences: AlertPreferences;
}

export interface DeviceRegistration {
  id: string;
  userId: string;
  platform: "ios" | "android";
  pushToken: string;
  deviceName?: string;
  appVersion?: string;
  enabled: boolean;
  lastSeenAt: string;
}

export type PushProvider = "expo" | "firebase" | "apns" | "none";

export interface PushTokenRecord extends DeviceRegistration {
  provider: PushProvider;
  createdAt: string;
}

export interface MobilePushAdapter {
  send(payload: {
    userId: string;
    alert: Pick<AlertEvent, "id" | "type" | "severity" | "title" | "shortMessage" | "symbol">;
    deepLink?: string;
  }): Promise<{ ok: boolean; provider: PushProvider; error?: string }>;
}

export interface AlertStreamEnvelope<T = unknown> {
  event:
    | "alert.created"
    | "alert.updated"
    | "alert.read"
    | "alert.acknowledged"
    | "alert.dismissed"
    | "preferences.updated"
    | "source.health_changed"
    | "heartbeat";
  version: 1;
  data: T;
}

const severityOrder: AlertSeverity[] = ["P0", "P1", "P2", "P3", "P4"];

export function severityRank(severity: AlertSeverity): number {
  return severityOrder.indexOf(severity);
}

export function isSeverityAtLeast(severity: AlertSeverity, minSeverity: AlertSeverity): boolean {
  return severityRank(severity) <= severityRank(minSeverity);
}

export function defaultAlertPreferences(userId?: string): AlertPreferences {
  return {
    userId,
    enabled: true,
    minSeverity: "P4",
    enabledDomains: {
      gamma: true,
      market: true,
      flow: false,
      account: true,
      system: true,
    },
    disabledTypes: [],
    channelsBySeverity: {
      P0: ["in_app", "desktop_native"],
      P1: ["in_app", "desktop_native"],
      P2: ["in_app"],
      P3: ["in_app"],
      P4: ["in_app"],
    },
    soundBySeverity: {
      P0: true,
      P1: true,
      P2: false,
      P3: false,
      P4: false,
    },
    symbols: ["BTCUSDT"],
    proximity: {
      mode: "volatility",
      percent: 0.35,
      absolute: 250,
      volatilityMultiplier: 0.35,
    },
    pnlThresholds: {
      warningPct: -3,
      criticalPct: -8,
    },
    marginThresholds: {
      warningPct: 35,
      criticalPct: 18,
    },
    allowBookmapAlerts: false,
    desktopNativeWhenForeground: false,
  };
}
