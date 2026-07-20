/**
 * AI-6.4 — RealMarketTelemetryRuntimeBridge
 * Subscribes to reduced bookmapTradeAggregation.summary (and optional lifecycle counts).
 * Registers into selectorRegistry. Material coalescing only — no timers/recalc/publish/history.
 * No React/canvas/feed lifecycle. Web + Tauri share this module.
 */
import type { BookmapTradeSessionSummary } from "@/components/flows/bookmapTradeTypes";
import {
  clearRealTelemetrySelectorRegistry,
  getRealTelemetrySelectorSnapshot,
  pushRealTelemetrySelectors,
  removeRealTelemetrySelectors,
} from "./selectorRegistry";
import {
  selectLifecycleFromAudit,
  selectOrderFlowFromTradeSummary,
  type RealLifecycleAudit,
  type RealOrderFlowSummary,
} from "./realMarketTelemetrySource";

export type RuntimeBridgeStage =
  | "idle"
  | "producer_connected"
  | "registry_updated"
  | "cleared"
  | "coalesced_skip";

export type RuntimeBridgeStats = {
  updatesSeen: number;
  registryWrites: number;
  coalescedSkips: number;
  lastStage: RuntimeBridgeStage;
  lastSymbol: string | null;
  lastWriteAtMs: number | null;
  lastCoalesceMs: number | null;
};

function summaryFingerprint(s: RealOrderFlowSummary | null, life: RealLifecycleAudit | null): string {
  if (!s && !life) return "empty";
  return [
    s?.tradeCount ?? 0,
    Math.round((s?.delta ?? 0) * 1000) / 1000,
    Math.round((s?.cvd ?? 0) * 1000) / 1000,
    Math.round((s?.imbalancePct ?? 0) * 10) / 10,
    life?.pullingCandidateCount ?? 0,
    life?.spoofingCandidateCount ?? 0,
    life?.refilledLevelCount ?? 0,
  ].join("|");
}

/** Min interval between registry writes for identical-ish bursts (coalesce). */
export const RUNTIME_BRIDGE_COALESCE_MS = 100;

class RealMarketTelemetryRuntimeBridgeImpl {
  private activeSymbol: string | null = null;
  private lastFp: string | null = null;
  private lastWriteAtMs = 0;
  private stats: RuntimeBridgeStats = {
    updatesSeen: 0,
    registryWrites: 0,
    coalescedSkips: 0,
    lastStage: "idle",
    lastSymbol: null,
    lastWriteAtMs: null,
    lastCoalesceMs: null,
  };
  private listeners = new Set<(s: RuntimeBridgeStats) => void>();

  getStats(): RuntimeBridgeStats {
    return { ...this.stats };
  }

  subscribe(listener: (s: RuntimeBridgeStats) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(stage: RuntimeBridgeStage): void {
    this.stats.lastStage = stage;
    const snap = this.getStats();
    for (const l of Array.from(this.listeners)) {
      try {
        l(snap);
      } catch {
        /* ignore */
      }
    }
  }

  /**
   * Notify from producer (useBookmapTrades / panel effect).
   * Accepts only reduced summary — never raw trades arrays.
   */
  notifyBookmapTradeSummary(params: {
    symbol: string;
    summary: BookmapTradeSessionSummary | null | undefined;
    lifecycleAudit?: RealLifecycleAudit | null;
    nowMs?: number;
  }): { wrote: boolean; coalesceMs?: number } {
    const t0 =
      typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
    this.stats.updatesSeen += 1;
    const symbol = (params.symbol || "BTCUSDT").trim().toUpperCase().slice(0, 32) || "BTCUSDT";
    const nowMs = params.nowMs ?? Date.now();

    if (this.activeSymbol && this.activeSymbol !== symbol) {
      removeRealTelemetrySelectors(this.activeSymbol);
    }
    this.activeSymbol = symbol;
    this.stats.lastSymbol = symbol;
    this.emit("producer_connected");

    const of = selectOrderFlowFromTradeSummary(
      params.summary
        ? {
            tradeCount: params.summary.tradeCount,
            buyVolume: params.summary.buyVolume,
            sellVolume: params.summary.sellVolume,
            delta: params.summary.delta,
            cvd: params.summary.cvd,
            imbalancePct: params.summary.imbalancePct,
            firstTimestamp: params.summary.firstTimestamp,
            lastTimestamp: params.summary.lastTimestamp,
          }
        : null,
    );
    const life = selectLifecycleFromAudit(params.lifecycleAudit ?? null);
    const fp = summaryFingerprint(of, life);

    const since = nowMs - this.lastWriteAtMs;
    if (fp === this.lastFp && since < RUNTIME_BRIDGE_COALESCE_MS) {
      this.stats.coalescedSkips += 1;
      const coalesceMs =
        (typeof performance !== "undefined" && performance.now ? performance.now() : Date.now()) - t0;
      this.stats.lastCoalesceMs = coalesceMs;
      this.emit("coalesced_skip");
      return { wrote: false, coalesceMs };
    }

    pushRealTelemetrySelectors({
      symbol,
      orderFlowSummary: of,
      footprintSummary: null,
      lifecycleAudit: life,
      capturedAtMs: nowMs,
      instrumentId: symbol,
    });
    this.lastFp = fp;
    this.lastWriteAtMs = nowMs;
    this.stats.registryWrites += 1;
    this.stats.lastWriteAtMs = nowMs;
    const coalesceMs =
      (typeof performance !== "undefined" && performance.now ? performance.now() : Date.now()) - t0;
    this.stats.lastCoalesceMs = coalesceMs;
    this.emit("registry_updated");
    return { wrote: true, coalesceMs };
  }

  /** Cleanup on symbol change / disconnect / unmount / logout */
  clear(symbol?: string): void {
    if (symbol) {
      removeRealTelemetrySelectors(symbol);
      if (this.activeSymbol === symbol.toUpperCase()) this.activeSymbol = null;
    } else if (this.activeSymbol) {
      removeRealTelemetrySelectors(this.activeSymbol);
      this.activeSymbol = null;
    } else {
      clearRealTelemetrySelectorRegistry();
    }
    this.lastFp = null;
    this.emit("cleared");
  }

  hasRegistry(symbol: string): boolean {
    return !!getRealTelemetrySelectorSnapshot(symbol)?.orderFlowSummary;
  }

  resetStatsForTests(): void {
    this.stats = {
      updatesSeen: 0,
      registryWrites: 0,
      coalescedSkips: 0,
      lastStage: "idle",
      lastSymbol: null,
      lastWriteAtMs: null,
      lastCoalesceMs: null,
    };
    this.lastFp = null;
    this.lastWriteAtMs = 0;
    this.activeSymbol = null;
  }
}

/** Process-wide singleton — shared by Web and Tauri shells. */
export const realMarketTelemetryRuntimeBridge = new RealMarketTelemetryRuntimeBridgeImpl();

export type { RealOrderFlowSummary };
