export type EndpointTiming = {
  method: string;
  path: string;
  status: number;
  durationMs: number;
  userId?: number | string;
  degraded?: boolean;
  timestamp: string;
};

const MAX_SLOW_ENDPOINTS = 50;
const slowEndpoints: EndpointTiming[] = [];

export function recordEndpointTiming(timing: EndpointTiming): void {
  if (timing.durationMs <= 1_000) return;
  slowEndpoints.unshift(timing);
  if (slowEndpoints.length > MAX_SLOW_ENDPOINTS) {
    slowEndpoints.length = MAX_SLOW_ENDPOINTS;
  }
}

export function getRecentSlowEndpoints(limit = 20): EndpointTiming[] {
  return slowEndpoints.slice(0, limit);
}
