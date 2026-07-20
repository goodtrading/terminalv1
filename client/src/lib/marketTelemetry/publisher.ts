/**
 * Compact market telemetry publisher (AI-6.2 / AI-6.3).
 * Real vs synthetic modes isolated. Single active instance.
 * Start only from Debug UI (caller). Stop on unmount/logout.
 * Symbol change → new sessionId. No localStorage dump. No auto-start.
 */
import { apiUrl } from "@/lib/apiBase";
import { getAuthToken } from "@/lib/authToken";
import {
  fingerprintFromTelemetry,
  TELEMETRY_DEFAULT_INTERVAL_MS,
  TELEMETRY_MIN_INTERVAL_MS,
  type CompactMarketTelemetry,
  type TelemetryMode,
} from "./buildCompactMarketTelemetry";
import {
  buildTelemetryFromRealSource,
  readModelFromRegistry,
  type RealMarketTelemetryReadModel,
} from "./realMarketTelemetrySource";
import { hasRealTelemetrySelectors } from "./selectorRegistry";

export type TelemetryPublisherOptions = {
  symbol: string;
  sessionId: string;
  intervalMs?: number;
  /** real | synthetic_debug */
  telemetryMode: Exclude<TelemetryMode, "unavailable">;
  /** Synthetic-only reduced input factory */
  getSyntheticReadModel?: () => RealMarketTelemetryReadModel;
  onStatus?: (msg: string) => void;
  onSessionReset?: (sessionId: string) => void;
};

let activePublisher: CompactMarketTelemetryPublisher | null = null;

export class CompactMarketTelemetryPublisher {
  private timer: ReturnType<typeof setInterval> | null = null;
  private sequence = 0;
  private prevFp: string | null = null;
  private stopped = true;
  private opts: TelemetryPublisherOptions;
  private readonly intervalMs: number;
  private sessionId: string;
  private symbol: string;

  constructor(opts: TelemetryPublisherOptions) {
    this.opts = opts;
    this.symbol = opts.symbol.trim().toUpperCase();
    this.sessionId = opts.sessionId;
    this.intervalMs = Math.max(
      TELEMETRY_MIN_INTERVAL_MS,
      opts.intervalMs ?? TELEMETRY_DEFAULT_INTERVAL_MS,
    );
  }

  getMode(): TelemetryMode {
    return this.opts.telemetryMode;
  }

  getSessionId(): string {
    return this.sessionId;
  }

  /** Material symbol change → reset session + sequence. */
  setSymbol(next: string): void {
    const sym = next.trim().toUpperCase().slice(0, 32);
    if (sym === this.symbol) return;
    this.symbol = sym;
    this.sessionId = newTelemetrySessionId();
    this.sequence = 0;
    this.prevFp = null;
    this.opts.onSessionReset?.(this.sessionId);
    this.opts.onStatus?.(`session reset for symbol=${sym}`);
  }

  start(): void {
    if (activePublisher && activePublisher !== this) {
      activePublisher.stop();
    }
    activePublisher = this;
    if (!this.stopped) return;
    this.stopped = false;
    this.opts.onStatus?.(`started mode=${this.opts.telemetryMode}`);
    void this.tick();
    this.timer = setInterval(() => void this.tick(), this.intervalMs);
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (activePublisher === this) activePublisher = null;
    this.opts.onStatus?.("stopped");
  }

  async sendOnce(): Promise<{ ok: boolean; status: number; body?: unknown }> {
    return this.tick(true);
  }

  private resolveReadModel(): RealMarketTelemetryReadModel {
    if (this.opts.telemetryMode === "synthetic_debug") {
      return (
        this.opts.getSyntheticReadModel?.() ?? {
          symbol: this.symbol,
          orderFlowSummary: null,
          footprintSummary: null,
          lifecycleAudit: null,
        }
      );
    }
    // Real: registry only — never fall back to synthetic demo numbers
    return readModelFromRegistry(this.symbol);
  }

  private async tick(force = false): Promise<{ ok: boolean; status: number; body?: unknown }> {
    if (this.stopped && !force) return { ok: false, status: 0 };
    this.sequence += 1;
    const readModel = this.resolveReadModel();
    const { telemetry, bytes, unavailableReason, quality } = buildTelemetryFromRealSource({
      readModel: { ...readModel, symbol: this.symbol },
      sessionId: this.sessionId,
      sequence: this.sequence,
      previousFingerprint: this.prevFp,
      forceHeartbeat: force || undefined,
      telemetryMode: this.opts.telemetryMode,
    });

    if (unavailableReason) {
      this.opts.onStatus?.(`skip: ${unavailableReason}`);
      return { ok: false, status: 413 };
    }

    if (this.opts.telemetryMode === "real" && !quality.ok && !force) {
      this.opts.onStatus?.(
        `real quality fail: ${quality.issues.join(",") || "no selectors"}`,
      );
      // Still allow heartbeat force send of UNAVAILABLE envelope when Send Once
    }

    this.prevFp = fingerprintFromTelemetry(telemetry);

    try {
      const headers: Record<string, string> = { "content-type": "application/json" };
      const token = getAuthToken();
      if (token) headers.Authorization = `Bearer ${token}`;
      const res = await fetch(apiUrl("/api/internal/ai/market/telemetry"), {
        method: "POST",
        credentials: "include",
        headers,
        body: JSON.stringify({ telemetry }),
      });
      const body = res.status === 204 ? undefined : await res.json().catch(() => ({}));
      this.opts.onStatus?.(
        `[${telemetry.telemetryMode}/${telemetry.namespace}] seq=${telemetry.sequence} bytes=${bytes} http=${res.status}`,
      );
      return { ok: res.ok || res.status === 202 || res.status === 204, status: res.status, body };
    } catch (e) {
      this.opts.onStatus?.(e instanceof Error ? e.message : "network error");
      return { ok: false, status: 0 };
    }
  }
}

export function stopActiveTelemetryPublisher(): void {
  activePublisher?.stop();
  activePublisher = null;
}

export function newTelemetrySessionId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `sess_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export { hasRealTelemetrySelectors };
export type { CompactMarketTelemetry };
