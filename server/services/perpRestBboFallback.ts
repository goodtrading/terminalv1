import type { PerpRestBboObservation } from "./orderbookServicePerp";

export const PERP_REST_BBO_POLL_INTERVAL_MS = 1_000;
export const PERP_REST_BBO_MAX_AGE_MS = 3_000;

export type PerpRestBboFallbackQuote = {
  marketDataSource: "BINANCE_FAPI_REST_BOOKTICKER";
  instrument: "BTCUSDT-PERP";
  bestBidPrice: string;
  bestBidSize: string;
  bestAskPrice: string;
  bestAskSize: string;
  sourceTimestampMs: number;
  sourceAgeMs: number;
  localAppliedTimestampMs: number;
  provenance: {
    source: "BINANCE_FAPI_REST_BOOKTICKER";
    endpoint: string;
    instrument: "BTCUSDT-PERP";
    sourceTimestampMs: number;
    observedAtMs: number;
    ageMs: number;
    serverTimeSampleMs: number;
    serverTimeRttMs: number;
    serverClockOffsetMs: number;
    clockUncertaintyMs: number;
    lastUpdateId?: number;
  };
  source: "binance";
  market: "perpetual";
  symbol: "BTCUSDT";
};

type Timer = ReturnType<typeof setInterval>;

export type PerpRestBboFallbackDependencies = {
  fetchObservation: () => Promise<PerpRestBboObservation>;
  websocketFresh: () => boolean;
  publishQuote: (quote: PerpRestBboFallbackQuote) => boolean;
  publishUnavailable: () => void;
  nowMs?: () => number;
  setInterval?: typeof setInterval;
  clearInterval?: typeof clearInterval;
  pollIntervalMs?: number;
  maxAgeMs?: number;
  expiryCheckIntervalMs?: number;
};

/** Bounded fallback owned by the existing PERP provider; never constructs an L2 book. */
export class PerpRestBboFallback {
  private readonly nowMs: () => number;
  private readonly setIntervalFn: typeof setInterval;
  private readonly clearIntervalFn: typeof clearInterval;
  private readonly pollIntervalMs: number;
  private readonly maxAgeMs: number;
  private readonly expiryCheckIntervalMs: number;
  private pollTimer: Timer | null = null;
  private expiryTimer: Timer | null = null;
  private running = false;
  private inFlight = false;
  private activeSource: "rest" | "websocket" | null = null;
  private unavailablePublished = false;
  private latestRestObservation: PerpRestBboObservation | null = null;
  private lastPollAttemptAtMs: number | null = null;
  private lastPollSuccessAtMs: number | null = null;
  private lastPollError: { atMs: number; stage: "fetch" | "validation" | "publish"; message: string } | null = null;

  constructor(private readonly dependencies: PerpRestBboFallbackDependencies) {
    this.nowMs = dependencies.nowMs ?? Date.now;
    this.setIntervalFn = dependencies.setInterval ?? setInterval;
    this.clearIntervalFn = dependencies.clearInterval ?? clearInterval;
    this.pollIntervalMs = dependencies.pollIntervalMs ?? PERP_REST_BBO_POLL_INTERVAL_MS;
    this.maxAgeMs = dependencies.maxAgeMs ?? PERP_REST_BBO_MAX_AGE_MS;
    this.expiryCheckIntervalMs = dependencies.expiryCheckIntervalMs ?? 200;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    void this.pollOnce();
    this.pollTimer = this.setIntervalFn(() => void this.pollOnce(), this.pollIntervalMs);
    this.expiryTimer = this.setIntervalFn(() => this.expireIfStale(), this.expiryCheckIntervalMs);
    (this.pollTimer as unknown as { unref?: () => void }).unref?.();
    (this.expiryTimer as unknown as { unref?: () => void }).unref?.();
  }

  stop(): void {
    this.running = false;
    if (this.pollTimer !== null) this.clearIntervalFn(this.pollTimer);
    if (this.expiryTimer !== null) this.clearIntervalFn(this.expiryTimer);
    this.pollTimer = null;
    this.expiryTimer = null;
  }

  markWebsocketFresh(): void {
    this.activeSource = "websocket";
    this.latestRestObservation = null;
    this.unavailablePublished = false;
  }

  markWebsocketUnavailable(): void {
    if (this.hasFreshRestObservation()) return;
    this.activeSource = null;
    this.latestRestObservation = null;
    this.publishUnavailableOnce();
  }

  private publishUnavailableOnce(): void {
    if (this.unavailablePublished) return;
    this.dependencies.publishUnavailable();
    this.unavailablePublished = true;
  }

  private clearUnavailableForFreshQuote(): void {
    this.unavailablePublished = false;
  }

  async pollOnce(): Promise<boolean> {
    if (!this.running || this.inFlight) return false;
    if (this.dependencies.websocketFresh()) {
      this.markWebsocketFresh();
      return false;
    }
    this.inFlight = true;
    this.lastPollAttemptAtMs = this.nowMs();
    try {
      const observation = await this.dependencies.fetchObservation();
      const now = this.nowMs();
      const observedAgeMs = now - observation.observedAtMs;
      if (observation.symbol !== "BTCUSDT" ||
        !Number.isFinite(Number(observation.bid)) || !Number.isFinite(Number(observation.ask)) ||
          !Number.isFinite(Number(observation.bidSize)) || !Number.isFinite(Number(observation.askSize)) ||
          Number(observation.bid) <= 0 || Number(observation.ask) <= Number(observation.bid) ||
          Number(observation.bidSize) <= 0 || Number(observation.askSize) <= 0 ||
          !Number.isSafeInteger(observation.sourceTimestampMs) || observation.sourceTimestampMs <= 0 ||
          !Number.isSafeInteger(observation.observedAtMs) || observation.observedAtMs <= 0 ||
          observation.ageMs < 0 || observation.ageMs > this.maxAgeMs ||
          observedAgeMs < 0 || observedAgeMs > this.maxAgeMs || observation.ageMs + observedAgeMs > this.maxAgeMs ||
          observation.provenance.source !== "BINANCE_FAPI_REST_BOOKTICKER" ||
          observation.provenance.instrument !== "BTCUSDT-PERP" ||
          observation.provenance.endpoint !== "https://fapi.binance.com/fapi/v1/ticker/bookTicker?symbol=BTCUSDT" ||
          observation.provenance.sourceTimestampMs !== observation.sourceTimestampMs ||
          observation.provenance.observedAtMs !== observation.observedAtMs ||
          observation.provenance.ageMs !== observation.ageMs ||
          (observation.provenance.lastUpdateId !== undefined &&
            (!Number.isSafeInteger(observation.provenance.lastUpdateId) || observation.provenance.lastUpdateId <= 0))) {
        this.lastPollError = { atMs: this.nowMs(), stage: "validation", message: "REST BBO observation failed BTCUSDT-PERP freshness or validity checks" };
        this.expireIfStale();
        if (!this.dependencies.websocketFresh() && !this.hasFreshRestObservation()) {
          this.latestRestObservation = null;
          this.activeSource = null;
          this.publishUnavailableOnce();
        }
        return false;
      }
      // A synchronized WS update wins even if its REST request started first.
      if (this.dependencies.websocketFresh()) {
        this.markWebsocketFresh();
        return false;
      }
      if (this.latestRestObservation &&
          (observation.observedAtMs <= this.latestRestObservation.observedAtMs ||
           observation.sourceTimestampMs < this.latestRestObservation.sourceTimestampMs)) return false;

      const quote: PerpRestBboFallbackQuote = {
        marketDataSource: "BINANCE_FAPI_REST_BOOKTICKER",
        instrument: "BTCUSDT-PERP",
        bestBidPrice: observation.bid,
        bestBidSize: observation.bidSize,
        bestAskPrice: observation.ask,
        bestAskSize: observation.askSize,
        sourceTimestampMs: observation.sourceTimestampMs,
        sourceAgeMs: observation.ageMs,
        localAppliedTimestampMs: observation.observedAtMs,
        provenance: observation.provenance,
        source: "binance",
        market: "perpetual",
        symbol: "BTCUSDT",
      };
      if (!this.dependencies.publishQuote(quote)) {
        this.lastPollError = { atMs: this.nowMs(), stage: "publish", message: "PERP quote relay rejected the REST BBO" };
        return false;
      }
      this.latestRestObservation = observation;
      this.activeSource = "rest";
      this.clearUnavailableForFreshQuote();
      this.lastPollSuccessAtMs = this.nowMs();
      this.lastPollError = null;
      return true;
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : "REST BBO poll failed";
      this.lastPollError = {
        atMs: this.nowMs(),
        stage: "fetch",
        message: rawMessage.replace(/https?:\/\/\S+/gi, "[upstream URL]").slice(0, 180),
      };
      this.expireIfStale();
      if (!this.dependencies.websocketFresh() && !this.hasFreshRestObservation()) {
        this.latestRestObservation = null;
        this.activeSource = null;
        this.publishUnavailableOnce();
      }
      return false;
    } finally {
      this.inFlight = false;
    }
  }

  expireIfStale(): boolean {
    if (this.dependencies.websocketFresh()) {
      this.markWebsocketFresh();
      return false;
    }
    if (this.activeSource !== "rest" || !this.latestRestObservation) return false;
    const elapsed = this.nowMs() - this.latestRestObservation.observedAtMs;
    if (elapsed < 0 || elapsed + this.latestRestObservation.ageMs <= this.maxAgeMs) return false;
    this.latestRestObservation = null;
    this.activeSource = null;
    this.publishUnavailableOnce();
    return true;
  }

  hasFreshRestObservation(): boolean {
    if (this.activeSource !== "rest" || !this.latestRestObservation) return false;
    const elapsed = this.nowMs() - this.latestRestObservation.observedAtMs;
    return elapsed >= 0 && this.latestRestObservation.ageMs + elapsed <= this.maxAgeMs;
  }

  status(): {
    inFlight: boolean;
    source: "rest" | "websocket" | null;
    quoteAgeMs: number | null;
    lastPollAttemptAtMs: number | null;
    lastPollSuccessAtMs: number | null;
    lastPollError: { atMs: number; stage: "fetch" | "validation" | "publish"; message: string } | null;
  } {
    this.expireIfStale();
    const quoteAgeMs = this.latestRestObservation
      ? Math.max(0, this.nowMs() - this.latestRestObservation.observedAtMs + this.latestRestObservation.ageMs)
      : null;
    return {
      inFlight: this.inFlight,
      source: this.activeSource,
      quoteAgeMs,
      lastPollAttemptAtMs: this.lastPollAttemptAtMs,
      lastPollSuccessAtMs: this.lastPollSuccessAtMs,
      lastPollError: this.lastPollError,
    };
  }
}
