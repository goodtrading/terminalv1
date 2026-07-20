/**
 * Live snapshot coordinator (AI-6.1 / AI-6.2).
 * Adapters → optional client telemetry merge → Evidence/Confluence/Risk/Scores.
 * Never wires Mentor/OpenAI. Never calls buildLiveMarketContext.
 */
import type {
  LiveCompleteness,
  MarketSnapshot,
  SnapshotStaleness,
} from "@shared/goodTradingAiMarket";
import type { CompactMarketTelemetry } from "@shared/goodTradingAiMarketTelemetry";
import type { MarketProviderBundle } from "../snapshotContracts";
import { buildMarketSnapshot } from "../snapshotBuilder";
import { getLiveAdapters } from "./capabilities";
import {
  readLiveMarketFromServer,
  type LiveMarketReadModel,
  type LiveMarketReader,
} from "./sourceBoundary";
import { buildStaleness } from "./staleness";
import { normalizeSymbolWithProvenance } from "./symbolNormalize";
import type { AdapterObservation } from "./adapterTypes";
import { logLiveSnapshotObs } from "./observability";
import { applyClientTelemetryToBundle } from "../telemetry/clientTelemetryAdapter";
import { getMarketTelemetryStore } from "../telemetry/telemetryStore";
import { logTelemetryObs } from "../telemetry/observability";
import { tryCreateConfiguredTelemetryRepository } from "../telemetry/repositoryFactory";
import { repoGet } from "../telemetry/redisMarketTelemetryRepository";

export type LiveSnapshotResult = {
  snapshot: MarketSnapshot;
  issues: ReturnType<typeof buildMarketSnapshot>["issues"];
  completeness: LiveCompleteness;
  adapterStatuses: Array<{ sourceId: string; lens: string; status: LiveCompleteness; notes?: string }>;
  durationMs: number;
  telemetryMerged: boolean;
};

function mergeCompleteness(statuses: LiveCompleteness[]): LiveCompleteness {
  if (statuses.length === 0) return "UNAVAILABLE";
  if (statuses.every((s) => s === "UNAVAILABLE")) return "UNAVAILABLE";
  if (statuses.some((s) => s === "DEGRADED")) return "DEGRADED";
  if (statuses.some((s) => s === "PARTIAL" || s === "UNAVAILABLE")) return "PARTIAL";
  return "COMPLETE";
}

function observationsToBundle(obs: AdapterObservation[]): MarketProviderBundle {
  const bundle: MarketProviderBundle = {};
  for (const o of obs) {
    if (!o.lens) continue;
    const p = o.lens.provider;
    if (p === "gamma") bundle.gamma = o.lens;
    else if (p === "orderFlow") bundle.orderFlow = o.lens;
    else if (p === "liquidity") bundle.liquidity = o.lens;
    else if (p === "dom") bundle.dom = o.lens;
    else if (p === "openInterest") bundle.openInterest = o.lens;
    else if (p === "footprint") bundle.footprint = o.lens;
    else if (p === "marketStructure") bundle.marketStructure = o.lens;
  }
  return bundle;
}

export function buildLiveInternalSnapshotFromModel(
  model: LiveMarketReadModel,
  opts?: {
    telemetry?: CompactMarketTelemetry;
  },
): LiveSnapshotResult {
  const started = Date.now();
  const provenance = normalizeSymbolWithProvenance(model.symbol);
  const adapters = getLiveAdapters();
  const observations: AdapterObservation[] = [];
  const adapterStatuses: LiveSnapshotResult["adapterStatuses"] = [];

  for (const adapter of adapters) {
    try {
      const obs = adapter.read(model);
      observations.push(obs);
      adapterStatuses.push({
        sourceId: adapter.sourceId,
        lens: adapter.lens,
        status: obs.status,
        notes: obs.notes,
      });
    } catch (err) {
      adapterStatuses.push({
        sourceId: adapter.sourceId,
        lens: adapter.lens,
        status: "UNAVAILABLE",
        notes: err instanceof Error ? err.message : "adapter error",
      });
    }
  }

  let completeness = mergeCompleteness(adapterStatuses.map((s) => s.status));
  let bundle = observationsToBundle(observations);
  let telemetryMerged = false;

  if (opts?.telemetry) {
    bundle = applyClientTelemetryToBundle(bundle, opts.telemetry, model.capturedAtMs);
    telemetryMerged = true;
    if (completeness === "UNAVAILABLE") completeness = "PARTIAL";
    adapterStatuses.push({
      sourceId: "client_telemetry_order_flow",
      lens: "orderFlow",
      status: opts.telemetry.orderFlow.availability === "AVAILABLE" ? "PARTIAL" : "UNAVAILABLE",
      notes: "client telemetry merge",
    });
  }

  const staleness: SnapshotStaleness[] = [];
  for (const o of observations) {
    if (o.sourceId === "stub" || o.sourceId === "simulate") continue;
    staleness.push(buildStaleness(o.sourceId, o.capturedAtMs, model.capturedAtMs));
  }
  if (opts?.telemetry) {
    staleness.push(
      buildStaleness("client_telemetry_order_flow", opts.telemetry.clientCapturedAtMs, model.capturedAtMs),
    );
  }

  const { snapshot, issues } = buildMarketSnapshot({
    symbol: provenance.normalized,
    bundle,
    source: "live_internal",
    displayRef: model.ticker?.price,
    evidenceOrigin: "OBSERVED",
    liveMeta: {
      live: true,
      completeness,
      staleness,
      symbolProvenance: provenance,
    },
  });

  const durationMs = Date.now() - started;
  logLiveSnapshotObs({
    symbol: provenance.normalized,
    completeness,
    durationMs,
    adapterCount: adapterStatuses.length,
    availableCount: adapterStatuses.filter((s) => s.status !== "UNAVAILABLE").length,
  });
  if (telemetryMerged) {
    logTelemetryObs({
      event: "live_merge",
      symbol: provenance.normalized,
      sequence: opts?.telemetry?.sequence,
    });
  }

  return {
    snapshot: { ...snapshot, buildMs: durationMs },
    issues,
    completeness,
    adapterStatuses,
    durationMs,
    telemetryMerged,
  };
}

export async function buildLiveInternalSnapshot(params: {
  symbol?: string;
  sessionId?: string;
  userId?: number;
  reader?: LiveMarketReader;
  telemetry?: CompactMarketTelemetry;
}): Promise<LiveSnapshotResult> {
  const requested = params.symbol?.trim() || "BTCUSDT";
  const reader = params.reader ?? readLiveMarketFromServer;
  const model = await reader(requested);

  let telemetry = params.telemetry;
  if (!telemetry && params.userId != null && params.sessionId) {
    // Failure isolation: Redis/read errors → continue snapshot without client telemetry
    try {
      const created = await tryCreateConfiguredTelemetryRepository();
      if (created.ok) {
        const entry = await repoGet(
          created.repo,
          params.userId,
          params.sessionId,
          requested,
        );
        telemetry = entry?.telemetry;
      } else {
        const entry = getMarketTelemetryStore().getPreferReal(
          params.userId,
          params.sessionId,
          requested,
        );
        // Only use memory when configured mode is memory; redis error → skip merge
        if (created.mode === "memory") telemetry = entry?.telemetry;
      }
    } catch {
      /* snapshot continues without client telemetry */
    }
  }

  return buildLiveInternalSnapshotFromModel(model, { telemetry });
}
