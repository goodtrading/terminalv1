/**
 * AI-6.4.1 — Pseudonymized Redis key design for ephemeral telemetry.
 * Never stores raw user emails; hashes userId + sessionId.
 */
import { createHash } from "node:crypto";
import type { TelemetryNamespace } from "@shared/goodTradingAiMarketTelemetry";

export type TelemetryKeyParts = {
  prefix: string;
  userId: number;
  sessionId: string;
  symbol: string;
  namespace: TelemetryNamespace;
};

function shortHash(input: string, len = 16): string {
  return createHash("sha256").update(input).digest("hex").slice(0, len);
}

export function hashUserId(userId: number): string {
  return shortHash(`u:${Math.floor(userId)}`);
}

export function hashSessionId(sessionId: string): string {
  return shortHash(`s:${sessionId}`);
}

/**
 * Primary latest-only telemetry key.
 * Shape: `{prefix}:t:{userHash}:{sessionHash}:{namespace}:{SYMBOL}`
 */
export function buildTelemetryRepositoryKey(parts: TelemetryKeyParts): string {
  const symbol = parts.symbol.trim().toUpperCase().slice(0, 32);
  const ns = parts.namespace === "real" ? "real" : "syn";
  return [
    parts.prefix,
    "t",
    hashUserId(parts.userId),
    hashSessionId(parts.sessionId),
    ns,
    symbol,
  ].join(":");
}

/**
 * Session index set — members are telemetry keys for removeSession without KEYS/SCAN.
 * Shape: `{prefix}:sess:{userHash}:{sessionHash}`
 */
export function buildTelemetrySessionIndexKey(
  prefix: string,
  userId: number,
  sessionId: string,
): string {
  return [prefix, "sess", hashUserId(userId), hashSessionId(sessionId)].join(":");
}

export function parseNamespaceFromKeyTail(nsToken: string): TelemetryNamespace {
  return nsToken === "real" ? "real" : "synthetic_debug";
}
