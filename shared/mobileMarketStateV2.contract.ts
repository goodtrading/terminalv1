/**
 * Mobile market-state v2 — client-safe contract types.
 * Importable by the mobile app without server dependencies.
 *
 * Access model: terminal_mobile_access is inherited from the active
 * terminal SaaS subscription (no separate DB entitlement yet).
 * accessModel: "terminal_subscription_inherited"
 *
 * Recommended polling:
 * - Use mode=both as the primary foreground call.
 * - Poll every 4–5 seconds in foreground only.
 * - No background polling; refresh immediately on foreground resume.
 */

export type DataStatus =
  | "available"
  | "unavailable"
  | "stale"
  | "not_applicable"
  | "calculation_error";

export type SupportedAsset = "BTC";
export type SupportedMode = "micro" | "macro" | "both";

export type SpotPosition = "above_spot" | "below_spot" | "at_spot";

export interface ValueWithStatus<T> {
  value: T | null;
  status: DataStatus;
}

export interface DistanceMetrics {
  /** Signed delta: level - spot */
  signedDistanceUsd: number | null;
  /** Absolute distance in USD */
  distanceUsd: number | null;
  /** Signed percent: ((level - spot) / spot) * 100 */
  signedDistancePct: number | null;
  /** Absolute percent distance */
  distancePct: number | null;
  position: SpotPosition | null;
  status: DataStatus;
}

export interface DominantExpiryBlock {
  date: string | null;
  instrumentCode: string | null;
  daysToExpiry: number | null;
  status: DataStatus;
}

export interface MobileMarketStateV2Query {
  asset?: SupportedAsset;
  mode: SupportedMode;
}

export interface MobileMarketStateV2SuccessMeta {
  requestId: string;
  generatedAt: string;
  servedAt: string;
  snapshotId: string;
}

export interface MobileMarketStateV2ErrorBody {
  status: "error";
  error: {
    code: string;
    message: string;
    supportedAssets?: SupportedAsset[];
    retryAfterSec?: number;
  };
  meta: {
    requestId: string;
    servedAt: string;
    generatedAt?: string;
  };
}

export interface MobileMarketStateV2SuccessBody {
  status: "success";
  data: Record<string, unknown>;
  meta: MobileMarketStateV2SuccessMeta;
}

export type MobileMarketStateV2Response =
  | MobileMarketStateV2SuccessBody
  | MobileMarketStateV2ErrorBody;

export const MOBILE_V2_ERROR_CODES = {
  UNSUPPORTED_ASSET: "UNSUPPORTED_ASSET",
  INVALID_MODE: "INVALID_MODE",
  AUTH_REQUIRED: "AUTH_REQUIRED",
  PLAN_REQUIRED: "PLAN_REQUIRED",
  PLAN_EXPIRED: "PLAN_EXPIRED",
  ACCOUNT_INACTIVE: "ACCOUNT_INACTIVE",
  TERMINAL_ACCESS_DENIED: "TERMINAL_ACCESS_DENIED",
  MOBILE_RATE_LIMITED: "MOBILE_RATE_LIMITED",
  MARKET_STATE_UNAVAILABLE: "MARKET_STATE_UNAVAILABLE",
} as const;

export const MOBILE_V2_ACCESS_MODEL = "terminal_subscription_inherited" as const;
export const MOBILE_V2_SCHEMA_VERSION = "2.0.0" as const;
