import crypto from "crypto";
import { getBingxRecvWindowMs } from "./flags";

export type BingxParamValue = string | number | boolean | undefined;

export function buildSignedQuery(
  params: Record<string, BingxParamValue>,
): string {
  const entries = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => [k, String(v)] as const)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return entries.map(([k, v]) => `${k}=${v}`).join("&");
}

export function signBingxQuery(queryString: string, apiSecret: string): string {
  return crypto.createHmac("sha256", apiSecret).update(queryString).digest("hex");
}

export function appendSignature(
  params: Record<string, BingxParamValue>,
  apiSecret: string,
  nowMs = Date.now(),
): { query: string; timestamp: number; recvWindow: number } {
  const recvWindow = Number(params.recvWindow ?? getBingxRecvWindowMs());
  const withTime: Record<string, BingxParamValue> = {
    ...params,
    timestamp: nowMs,
    recvWindow,
  };
  const qs = buildSignedQuery(withTime);
  const signature = signBingxQuery(qs, apiSecret);
  return {
    query: `${qs}&signature=${signature}`,
    timestamp: nowMs,
    recvWindow,
  };
}

/** Estimate clock drift from BingX error messages when present. */
export function estimateClockDriftFromMessage(msg: string): number | undefined {
  const m = /timestamp.*?(-?\d+)/i.exec(msg);
  if (!m) return undefined;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : undefined;
}
