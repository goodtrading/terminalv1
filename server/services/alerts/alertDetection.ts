import type { AlertCandidate } from "./alertPolicyEngine";

export interface GammaAlertSnapshot {
  symbol: string;
  price: number | null;
  tickerStatus: "fresh" | "stale" | "unavailable";
  gammaRegime?: string | null;
  gammaFlip?: number | null;
  dealerPivot?: number | null;
  callWall?: number | null;
  putWall?: number | null;
  totalGex?: number | null;
  squeezeRisk?: string | null;
  cascadeRisk?: string | null;
  dataUpdatedAt?: number | null;
}

export interface DetectionOptions {
  now?: Date;
  userId?: string;
  source?: string;
  proximityThresholdPct?: number;
  volatilityThresholdPct?: number;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function sideOfLevel(price: number, level: number): "above" | "below" | "at" {
  const diff = price - level;
  if (Math.abs(diff) <= Math.max(level * 0.0005, 1)) return "at";
  return diff > 0 ? "above" : "below";
}

function crossed(previous: number | null, current: number | null, level: number | null): boolean {
  if (previous == null || current == null || level == null) return false;
  return (previous < level && current >= level) || (previous > level && current <= level);
}

function approached(price: number | null, level: number | null, thresholdPct: number): { ok: boolean; distance: number; threshold: number } {
  if (price == null || level == null || price <= 0 || level <= 0) return { ok: false, distance: 0, threshold: 0 };
  const distance = Math.abs(price - level);
  const threshold = Math.max(price * thresholdPct, 1);
  return { ok: distance <= threshold, distance, threshold };
}

function wallTouched(price: number | null, level: number | null): boolean {
  if (price == null || level == null || price <= 0 || level <= 0) return false;
  return Math.abs(price - level) <= Math.max(price * 0.0008, 5);
}

function candidate(input: {
  type: string;
  severity: AlertCandidate["severity"];
  domain: AlertCandidate["domain"];
  symbol?: string;
  title: string;
  message: string;
  shortMessage?: string;
  source: string;
  userId?: string;
  deduplicationKey: string;
  metadata: Record<string, unknown>;
  detectedAt: string;
}): AlertCandidate {
  return input;
}

export function detectGammaAndMarketAlerts(
  current: GammaAlertSnapshot,
  previous: GammaAlertSnapshot | null,
  options: DetectionOptions = {},
): AlertCandidate[] {
  const now = options.now ?? new Date();
  const detectedAt = now.toISOString();
  const source = options.source ?? "terminal-state";
  const thresholdPct = options.proximityThresholdPct ?? options.volatilityThresholdPct ?? 0.0035;
  const alerts: AlertCandidate[] = [];
  const symbol = current.symbol || "BTCUSDT";
  const price = finiteNumber(current.price);
  const previousPrice = finiteNumber(previous?.price);

  if (current.tickerStatus === "stale") {
    alerts.push(
      candidate({
        type: "system.stale_data",
        severity: "P1",
        domain: "system",
        symbol,
        title: "Market data is stale",
        message: `${symbol} market data is stale; trading signals may be delayed.`,
        shortMessage: "Market data stale",
        source,
        userId: options.userId,
        deduplicationKey: `system.stale_data:${symbol}:${source}`,
        detectedAt,
        metadata: { tickerStatus: current.tickerStatus, sourceHealthy: false },
      }),
    );
  }

  if (current.tickerStatus === "unavailable") {
    alerts.push(
      candidate({
        type: "system.data_source_down",
        severity: "P0",
        domain: "system",
        symbol,
        title: "Market data source down",
        message: `${symbol} ticker is unavailable. Critical market context is offline.`,
        shortMessage: "Market source down",
        source,
        userId: options.userId,
        deduplicationKey: `system.data_source_down:${symbol}:${source}`,
        detectedAt,
        metadata: { tickerStatus: current.tickerStatus, sourceHealthy: false },
      }),
    );
  } else if (previous?.tickerStatus && previous.tickerStatus !== "fresh" && current.tickerStatus === "fresh") {
    alerts.push(
      candidate({
        type: "system.data_source_restored",
        severity: "P3",
        domain: "system",
        symbol,
        title: "Market data restored",
        message: `${symbol} market data is fresh again.`,
        shortMessage: "Market data restored",
        source,
        userId: options.userId,
        deduplicationKey: `system.data_source_restored:${symbol}:${source}`,
        detectedAt,
        metadata: { previousStatus: previous.tickerStatus, tickerStatus: current.tickerStatus },
      }),
    );
  }

  if (previous?.gammaRegime && current.gammaRegime && previous.gammaRegime !== current.gammaRegime) {
    alerts.push(
      candidate({
        type: "gamma.regime_changed",
        severity: "P1",
        domain: "gamma",
        symbol,
        title: "Gamma regime changed",
        message: `${symbol} gamma regime changed from ${previous.gammaRegime} to ${current.gammaRegime}.`,
        shortMessage: `${previous.gammaRegime} -> ${current.gammaRegime}`,
        source,
        userId: options.userId,
        deduplicationKey: `gamma.regime_changed:${symbol}:${current.gammaRegime}`,
        detectedAt,
        metadata: { previous: previous.gammaRegime, current: current.gammaRegime, sourceHealthy: current.tickerStatus === "fresh" },
      }),
    );
  }

  const flip = finiteNumber(current.gammaFlip);
  const flipApproach = approached(price, flip, thresholdPct);
  if (flipApproach.ok) {
    alerts.push(
      candidate({
        type: "gamma.flip_approaching",
        severity: "P2",
        domain: "gamma",
        symbol,
        title: "Price approaching Gamma Flip",
        message: `${symbol} is approaching Gamma Flip near ${flip?.toFixed(0)}.`,
        shortMessage: `Near Gamma Flip ${flip?.toFixed(0)}`,
        source,
        userId: options.userId,
        deduplicationKey: `gamma.flip_approaching:${symbol}:${flip?.toFixed(0)}`,
        detectedAt,
        metadata: { price, level: flip, distance: flipApproach.distance, threshold: flipApproach.threshold, sourceHealthy: current.tickerStatus === "fresh" },
      }),
    );
  }
  if (crossed(previousPrice, price, flip)) {
    alerts.push(
      candidate({
        type: "gamma.flip_crossed",
        severity: "P1",
        domain: "gamma",
        symbol,
        title: "Gamma Flip crossed",
        message: `${symbol} crossed Gamma Flip near ${flip?.toFixed(0)}.`,
        shortMessage: `Gamma Flip crossed`,
        source,
        userId: options.userId,
        deduplicationKey: `gamma.flip_crossed:${symbol}:${flip?.toFixed(0)}:${sideOfLevel(price!, flip!)}`,
        detectedAt,
        metadata: { price, previousPrice, level: flip, side: sideOfLevel(price!, flip!) },
      }),
    );
  }

  for (const levelSpec of [
    { name: "dealer_pivot", level: finiteNumber(current.dealerPivot), crossedType: "gamma.dealer_pivot_crossed", approachingType: "gamma.dealer_pivot_approaching", label: "Dealer Pivot" },
    { name: "call_wall", level: finiteNumber(current.callWall), touchedType: "gamma.call_wall_touched", brokenType: "gamma.call_wall_broken", approachingType: "gamma.call_wall_approaching", label: "Call Wall" },
    { name: "put_wall", level: finiteNumber(current.putWall), touchedType: "gamma.put_wall_touched", brokenType: "gamma.put_wall_broken", approachingType: "gamma.put_wall_approaching", label: "Put Wall" },
  ]) {
    const ap = approached(price, levelSpec.level, thresholdPct);
    if (ap.ok) {
      alerts.push(
        candidate({
          type: levelSpec.approachingType,
          severity: "P2",
          domain: "gamma",
          symbol,
          title: `Price approaching ${levelSpec.label}`,
          message: `${symbol} is approaching ${levelSpec.label} near ${levelSpec.level?.toFixed(0)}.`,
          shortMessage: `Near ${levelSpec.label}`,
          source,
          userId: options.userId,
          deduplicationKey: `${levelSpec.approachingType}:${symbol}:${levelSpec.level?.toFixed(0)}`,
          detectedAt,
          metadata: { price, level: levelSpec.level, distance: ap.distance, threshold: ap.threshold },
        }),
      );
    }
    if (levelSpec.touchedType && wallTouched(price, levelSpec.level)) {
      alerts.push(
        candidate({
          type: levelSpec.touchedType,
          severity: "P1",
          domain: "gamma",
          symbol,
          title: `${levelSpec.label} touched`,
          message: `${symbol} touched ${levelSpec.label} near ${levelSpec.level?.toFixed(0)}.`,
          shortMessage: `${levelSpec.label} touched`,
          source,
          userId: options.userId,
          deduplicationKey: `${levelSpec.touchedType}:${symbol}:${levelSpec.level?.toFixed(0)}`,
          detectedAt,
          metadata: { price, level: levelSpec.level },
        }),
      );
    }
    if (levelSpec.crossedType && crossed(previousPrice, price, levelSpec.level)) {
      alerts.push(
        candidate({
          type: levelSpec.brokenType ?? levelSpec.crossedType,
          severity: "P1",
          domain: "gamma",
          symbol,
          title: `${levelSpec.label} crossed`,
          message: `${symbol} crossed ${levelSpec.label} near ${levelSpec.level?.toFixed(0)}.`,
          shortMessage: `${levelSpec.label} crossed`,
          source,
          userId: options.userId,
          deduplicationKey: `${levelSpec.brokenType ?? levelSpec.crossedType}:${symbol}:${levelSpec.level?.toFixed(0)}:${sideOfLevel(price!, levelSpec.level!)}`,
          detectedAt,
          metadata: { price, previousPrice, level: levelSpec.level, side: sideOfLevel(price!, levelSpec.level!) },
        }),
      );
    }
  }

  if (previous?.squeezeRisk && current.squeezeRisk && previous.squeezeRisk !== current.squeezeRisk && current.squeezeRisk === "HIGH") {
    alerts.push(
      candidate({
        type: "market.squeeze_risk_increased",
        severity: "P1",
        domain: "market",
        symbol,
        title: "Squeeze risk increased",
        message: `${symbol} squeeze risk increased to HIGH.`,
        shortMessage: "Squeeze risk HIGH",
        source,
        userId: options.userId,
        deduplicationKey: `market.squeeze_risk_increased:${symbol}:HIGH`,
        detectedAt,
        metadata: { previous: previous.squeezeRisk, current: current.squeezeRisk },
      }),
    );
  }

  if (previous?.cascadeRisk && current.cascadeRisk && previous.cascadeRisk !== current.cascadeRisk && current.cascadeRisk === "HIGH") {
    alerts.push(
      candidate({
        type: "market.cascade_risk_increased",
        severity: "P1",
        domain: "market",
        symbol,
        title: "Cascade risk increased",
        message: `${symbol} cascade risk increased to HIGH.`,
        shortMessage: "Cascade risk HIGH",
        source,
        userId: options.userId,
        deduplicationKey: `market.cascade_risk_increased:${symbol}:HIGH`,
        detectedAt,
        metadata: { previous: previous.cascadeRisk, current: current.cascadeRisk },
      }),
    );
  }

  return alerts;
}
