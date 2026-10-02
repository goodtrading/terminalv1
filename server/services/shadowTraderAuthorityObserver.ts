import { randomUUID } from "node:crypto";
import type { ShadowAuthoritySnapshot } from "@shared/shadowTrader";

export type ShadowAuthorityCounters = Readonly<{
  paperSubmit: number;
  nautilusMutation: number;
  liveSubmit: number;
  brokerSubmit: number;
}>;

const counters = { paperSubmit: 0, nautilusMutation: 0, liveSubmit: 0, brokerSubmit: 0 };
const epoch = randomUUID();

export function recordShadowAuthorityBoundary(boundary: keyof typeof counters): void { counters[boundary] += 1; }
export function getShadowAuthorityCounters(): ShadowAuthorityCounters { return { ...counters }; }
export function getShadowAuthoritySnapshot(capturedAt = new Date().toISOString()): ShadowAuthoritySnapshot { return { capturedAt, epoch, ...getShadowAuthorityCounters() }; }
export function computeShadowAuthorityDelta(baseline: ShadowAuthoritySnapshot, final: ShadowAuthoritySnapshot): { paperSubmit: number; nautilusMutation: number; liveSubmit: number; brokerSubmit: number } | null {
  if (baseline.epoch !== final.epoch) return null;
  return { paperSubmit: final.paperSubmit - baseline.paperSubmit, nautilusMutation: final.nautilusMutation - baseline.nautilusMutation, liveSubmit: final.liveSubmit - baseline.liveSubmit, brokerSubmit: final.brokerSubmit - baseline.brokerSubmit };
}
export function resetShadowAuthorityCounters(): void { counters.paperSubmit = 0; counters.nautilusMutation = 0; counters.liveSubmit = 0; counters.brokerSubmit = 0; }
