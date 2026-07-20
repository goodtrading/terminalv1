/**
 * Market Snapshot Debug — admin only (AI-6 / AI-6.1 / AI-6.2 / AI-6.3).
 * Modes: Stub / Simulated / Live Internal / Client Telemetry.
 * Telemetry: Real vs Synthetic actions clearly separated. No auto-start.
 * Never Bookmap/DOM raw / heatmap. mentorEligible=false always.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { apiUrl } from "@/lib/apiBase";
import type { MarketSnapshot, MarketSourceCapability } from "@shared/goodTradingAiMarket";
import {
  CompactMarketTelemetryPublisher,
  hasRealTelemetrySelectors,
  newTelemetrySessionId,
  stopActiveTelemetryPublisher,
} from "@/lib/marketTelemetry/publisher";
import { pushRealTelemetrySelectors } from "@/lib/marketTelemetry/selectorRegistry";
import type { TelemetryMode } from "@/lib/marketTelemetry/buildCompactMarketTelemetry";

type Rendered = {
  headline: string;
  sections: Array<{ title: string; body: string }>;
  markdown: string;
};

type Mode = "stub" | "simulate" | "live" | "telemetry";

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(apiUrl(path), {
    credentials: "include",
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });
  const body = (await res.json().catch(() => ({}))) as T & { code?: string; message?: string };
  if (!res.ok) {
    throw Object.assign(new Error(body.message || `HTTP ${res.status}`), { code: body.code });
  }
  return body;
}

const SCENARIOS = [
  "neutral",
  "bullish_confluence",
  "bearish_confluence",
  "conflicted",
  "high_risk",
  "thin_data",
] as const;

function syntheticReadModel(symbol: string) {
  return {
    symbol,
    orderFlowSummary: {
      tradeCount: 42,
      buyVolume: 12.5,
      sellVolume: 9.1,
      delta: 3.4,
      cvd: 8.2,
      imbalancePct: 18.5,
      windowMs: 90_000,
    },
    footprintSummary: null as null,
    lifecycleAudit: {
      pullingCandidateCount: 1,
      spoofingCandidateCount: 0,
      refilledLevelCount: 0,
    },
  };
}

export default function MarketSnapshotDebugPage() {
  const [note, setNote] = useState<string | null>(null);
  const [liveEnabled, setLiveEnabled] = useState(false);
  const [telemetryEnabled, setTelemetryEnabled] = useState(false);
  const [repositorySafety, setRepositorySafety] = useState<string | null>(null);
  const [runtimeStages, setRuntimeStages] = useState<string | null>(null);
  const [autoPublishInternal, setAutoPublishInternal] = useState(false);
  const [sessionId, setSessionId] = useState(() => newTelemetrySessionId());
  const [telemetryStatus, setTelemetryStatus] = useState("idle");
  const [telemetryUiMode, setTelemetryUiMode] = useState<"real" | "synthetic_debug">("real");
  const publisherRef = useRef<CompactMarketTelemetryPublisher | null>(null);
  const [snapshot, setSnapshot] = useState<MarketSnapshot | null>(null);
  const [rendered, setRendered] = useState<Rendered | null>(null);
  const [capabilities, setCapabilities] = useState<MarketSourceCapability[]>([]);
  const [adapterStatuses, setAdapterStatuses] = useState<
    Array<{ sourceId: string; lens: string; status: string; notes?: string }>
  >([]);
  const [mode, setMode] = useState<Mode>("stub");
  const [scenario, setScenario] = useState<(typeof SCENARIOS)[number]>("neutral");
  const [symbol, setSymbol] = useState("BTCUSDT");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [durationMs, setDurationMs] = useState<number | null>(null);
  const [tab, setTab] = useState<"render" | "json" | "evidence" | "capabilities">("render");
  const realAvailable = hasRealTelemetrySelectors(symbol);

  const refresh = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const status = await api<{
        note?: string;
        liveEnabled?: boolean;
        telemetryEnabled?: boolean;
        repositorySafety?: string;
        repositoryConfigured?: string;
        repositoryMode?: string;
        mentorEligible?: boolean;
        autoPublishInternal?: boolean;
        redisError?: string | null;
        sharedError?: string | null;
        redisConfigClassification?: string;
        redisSmoke?: {
          smokeValidated?: boolean;
          sharedRepository?: string;
          latencyVerdict?: string;
        };
        redis?: {
          configured?: boolean;
          urlEnvName?: string | null;
          prefix?: string | null;
          ttlMs?: number | null;
          tls?: boolean | null;
        };
        mentorReadiness?: {
          stages?: {
            producer?: string;
            registry?: string;
            repository?: string;
            snapshotMerge?: string;
          };
          blockers?: string[];
          redis?: {
            smokeValidated?: boolean;
            latencyVerdict?: string;
            sharedRepository?: string;
          };
        };
      }>("/api/internal/ai/market/status");
      setNote(status.note ?? null);
      setLiveEnabled(!!status.liveEnabled);
      setTelemetryEnabled(!!status.telemetryEnabled);
      setRepositorySafety(status.repositorySafety ?? null);
      setAutoPublishInternal(!!status.autoPublishInternal);
      const st = status.mentorReadiness?.stages;
      const smoke = status.redisSmoke;
      const redisBit = status.redis
        ? ` · redis=${status.redis.configured ? "cfg" : "off"}/${status.redis.urlEnvName ?? "no-url"}`
        : "";
      const smokeBit = smoke
        ? ` · smoke=${smoke.smokeValidated ? "OK" : "no"}/${smoke.latencyVerdict ?? "NOT_MEASURED"}/${smoke.sharedRepository ?? "NOT_MEASURED"}`
        : "";
      setRuntimeStages(
        st
          ? `repoMode=${status.repositoryConfigured ?? status.repositoryMode ?? "?"} · class=${status.redisConfigClassification ?? "?"} · producer=${st.producer} · registry=${st.registry} · repo=${st.repository} · merge=${st.snapshotMerge}${
              status.redisError || status.sharedError ? ` · redisError` : ""
            }${redisBit}${smokeBit}`
          : null,
      );

      const caps = await api<{ capabilities: MarketSourceCapability[] }>(
        "/api/internal/ai/market/capabilities",
      );
      setCapabilities(caps.capabilities);

      if (mode === "stub") {
        const res = await api<{
          snapshot: MarketSnapshot;
          rendered: Rendered;
          durationMs: number;
        }>(`/api/internal/ai/market/snapshot?symbol=${encodeURIComponent(symbol)}`);
        setSnapshot(res.snapshot);
        setRendered(res.rendered);
        setDurationMs(res.durationMs);
        setAdapterStatuses([]);
      } else if (mode === "simulate") {
        const res = await api<{
          snapshot: MarketSnapshot;
          rendered: Rendered;
          durationMs: number;
        }>("/api/internal/ai/market/simulate", {
          method: "POST",
          body: JSON.stringify({ symbol, scenario }),
        });
        setSnapshot(res.snapshot);
        setRendered(res.rendered);
        setDurationMs(res.durationMs);
        setAdapterStatuses([]);
      } else if (mode === "telemetry") {
        setSnapshot(null);
        setRendered(null);
        setAdapterStatuses([]);
        setDurationMs(null);
      } else {
        const res = await api<{
          snapshot: MarketSnapshot;
          rendered: Rendered;
          durationMs: number;
          adapterStatuses?: typeof adapterStatuses;
          telemetryMerged?: boolean;
        }>(
          `/api/internal/ai/market/live?symbol=${encodeURIComponent(symbol)}&sessionId=${encodeURIComponent(sessionId)}`,
        );
        setSnapshot(res.snapshot);
        setRendered(res.rendered);
        setDurationMs(res.durationMs);
        setAdapterStatuses(res.adapterStatuses ?? []);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error cargando snapshot");
    } finally {
      setBusy(false);
    }
  }, [mode, scenario, symbol, sessionId]);

  useEffect(() => {
    return () => {
      publisherRef.current?.stop();
      publisherRef.current = null;
      stopActiveTelemetryPublisher();
    };
  }, []);

  useEffect(() => {
    publisherRef.current?.setSymbol(symbol);
  }, [symbol]);

  const ensurePublisher = (uiMode: "real" | "synthetic_debug") => {
    if (publisherRef.current && publisherRef.current.getMode() !== uiMode) {
      publisherRef.current.stop();
      publisherRef.current = null;
    }
    if (publisherRef.current) return publisherRef.current;
    publisherRef.current = new CompactMarketTelemetryPublisher({
      symbol,
      sessionId,
      telemetryMode: uiMode as Exclude<TelemetryMode, "unavailable">,
      onStatus: setTelemetryStatus,
      onSessionReset: setSessionId,
      getSyntheticReadModel:
        uiMode === "synthetic_debug" ? () => syntheticReadModel(symbol) : undefined,
    });
    return publisherRef.current;
  };

  const seedHarnessRealSelectors = () => {
    pushRealTelemetrySelectors({
      symbol,
      orderFlowSummary: {
        tradeCount: 55,
        buyVolume: 14,
        sellVolume: 8,
        delta: 6,
        cvd: 11,
        imbalancePct: 27.3,
        windowMs: 60_000,
      },
      footprintSummary: {
        totalBars: 3,
        totalDelta: 2,
        stackedBuy: true,
        stackedSell: false,
        hasPoc: true,
      },
      lifecycleAudit: {
        pullingCandidateCount: 2,
        spoofingCandidateCount: 1,
        refilledLevelCount: 0,
      },
    });
    setTelemetryStatus("harness: real selectors seeded in registry");
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100" data-testid="market-snapshot-debug">
      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-6 flex flex-wrap items-center gap-2 text-sm text-zinc-400">
          <Link href="/admin" className="text-terminal-accent hover:underline">
            Admin
          </Link>
          <span>/</span>
          <Link href="/admin/knowledge-health" className="text-terminal-accent hover:underline">
            Knowledge Health
          </Link>
          <span>/</span>
          <span className="text-zinc-200">Market Snapshot</span>
        </div>

        <h1 className="mb-2 text-2xl font-semibold tracking-tight">Market Snapshot Debug</h1>
        <p className="mb-4 max-w-2xl text-sm text-zinc-400">
          Stub / Simulated / Live Internal / Client Telemetry. Sin Mentor (mentorEligible=false).
          Sin Bookmap/DOM raw.
        </p>

        {note && <p className="mb-3 text-xs text-zinc-500">{note}</p>}
        {repositorySafety && (
          <p className="mb-3 font-mono text-[11px] text-amber-400/80">
            repositorySafety={repositorySafety}
            {autoPublishInternal ? " · autoPublishInternal=ON" : " · autoPublishInternal=OFF"}
          </p>
        )}
        {runtimeStages && (
          <p className="mb-3 font-mono text-[11px] text-sky-400/80">stages: {runtimeStages}</p>
        )}
        {error && (
          <div className="mb-4 rounded border border-red-900/60 bg-red-950/40 px-3 py-2 text-sm text-red-200">
            {error}
            <div className="mt-1 font-mono text-xs text-zinc-400">
              GOODTRADING_AI_MARKET_SNAPSHOT_ENABLED=true
              {mode === "live" && " · GOODTRADING_AI_MARKET_LIVE_ENABLED=true"}
              {mode === "telemetry" && " · GOODTRADING_AI_MARKET_TELEMETRY_ENABLED=true"}
            </div>
          </div>
        )}

        <div className="mb-4 flex flex-wrap gap-2">
          {(["stub", "simulate", "live", "telemetry"] as Mode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                publisherRef.current?.stop();
                setMode(m);
              }}
              className={`rounded px-3 py-1.5 text-sm ${
                mode === m ? "bg-emerald-800 text-white" : "border border-zinc-700 text-zinc-400"
              }`}
            >
              {m === "stub"
                ? "Stub"
                : m === "simulate"
                  ? "Simulated"
                  : m === "live"
                    ? "Live Internal"
                    : "Client Telemetry"}
              {m === "live" && !liveEnabled ? " (flag off)" : ""}
              {m === "telemetry" && !telemetryEnabled ? " (flag off)" : ""}
            </button>
          ))}
        </div>

        {mode === "telemetry" && (
          <div className="mb-6 space-y-3 rounded border border-zinc-800 p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs text-zinc-500">session={sessionId.slice(0, 8)}…</span>
              <span
                className={`rounded px-2 py-0.5 text-[10px] uppercase ${
                  telemetryUiMode === "real"
                    ? "bg-sky-900/60 text-sky-200"
                    : "bg-amber-900/50 text-amber-200"
                }`}
              >
                {telemetryUiMode === "real" ? "REAL" : "SYNTHETIC_DEBUG"}
              </span>
              <span className="text-[11px] text-zinc-500">
                real selectors: {realAvailable ? "present" : "absent"}
              </span>
            </div>

            <div className="flex flex-wrap gap-2 border-b border-zinc-800 pb-2">
              <button
                type="button"
                onClick={() => {
                  publisherRef.current?.stop();
                  publisherRef.current = null;
                  setTelemetryUiMode("real");
                }}
                className={`rounded px-2 py-1 text-xs ${
                  telemetryUiMode === "real" ? "bg-sky-800 text-white" : "border border-zinc-600"
                }`}
              >
                Use Real
              </button>
              <button
                type="button"
                onClick={() => {
                  publisherRef.current?.stop();
                  publisherRef.current = null;
                  setTelemetryUiMode("synthetic_debug");
                }}
                className={`rounded px-2 py-1 text-xs ${
                  telemetryUiMode === "synthetic_debug"
                    ? "bg-amber-800 text-white"
                    : "border border-zinc-600"
                }`}
              >
                Use Synthetic
              </button>
              <button
                type="button"
                onClick={seedHarnessRealSelectors}
                className="rounded border border-sky-800 px-2 py-1 text-xs text-sky-300 hover:bg-sky-950"
              >
                Seed Real Harness
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={busy || !telemetryEnabled}
                onClick={() => ensurePublisher(telemetryUiMode).start()}
                className="rounded border border-zinc-600 px-2 py-1 text-xs hover:bg-zinc-800 disabled:opacity-40"
              >
                Start ({telemetryUiMode === "real" ? "Real" : "Synthetic"})
              </button>
              <button
                type="button"
                onClick={() => publisherRef.current?.stop()}
                className="rounded border border-zinc-600 px-2 py-1 text-xs hover:bg-zinc-800"
              >
                Stop
              </button>
              <button
                type="button"
                disabled={busy || !telemetryEnabled}
                onClick={() => void ensurePublisher(telemetryUiMode).sendOnce()}
                className="rounded bg-emerald-800 px-2 py-1 text-xs disabled:opacity-40"
              >
                Send Once ({telemetryUiMode === "real" ? "Real" : "Synthetic"})
              </button>
              <span className="text-xs text-zinc-400">{telemetryStatus}</span>
            </div>
            <p className="text-[11px] text-zinc-600">
              No auto-start. Real mode never uses demo numbers. Synthetic is explicitly badged.
              Flag: GOODTRADING_AI_MARKET_TELEMETRY_ENABLED. mentorEligible=false.
            </p>
          </div>
        )}

        <div className="mb-6 flex flex-wrap items-end gap-3">
          <label className="text-xs text-zinc-500">
            Symbol
            <input
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              className="mt-1 block rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm"
            />
          </label>
          {mode === "simulate" && (
            <label className="text-xs text-zinc-500">
              Scenario
              <select
                value={scenario}
                onChange={(e) => setScenario(e.target.value as (typeof SCENARIOS)[number])}
                className="mt-1 block rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm"
              >
                {SCENARIOS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={() => void refresh()}
            className="rounded bg-emerald-700 px-3 py-1.5 text-sm hover:bg-emerald-600 disabled:opacity-50"
          >
            {busy ? "Loading…" : "Manual Refresh"}
          </button>
          {durationMs != null && (
            <span className="font-mono text-xs text-zinc-500">{durationMs} ms</span>
          )}
          {snapshot?.completeness && (
            <span className="font-mono text-xs text-amber-400/90">{snapshot.completeness}</span>
          )}
        </div>

        {snapshot && (
          <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              ["Confidence", snapshot.scores.marketConfidence],
              ["Confluence", snapshot.scores.confluence],
              ["Risk", snapshot.scores.risk],
              ["Quality", snapshot.scores.snapshotQuality],
            ].map(([k, v]) => (
              <div key={String(k)} className="rounded border border-zinc-800 bg-zinc-900/50 px-3 py-2">
                <div className="text-[10px] uppercase text-zinc-500">{k}</div>
                <div className="font-mono text-lg">{v}</div>
              </div>
            ))}
          </div>
        )}

        <div className="mb-3 flex gap-2 text-sm">
          {(["render", "json", "evidence", "capabilities"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`rounded px-2 py-1 ${tab === t ? "bg-zinc-800 text-white" : "text-zinc-500"}`}
            >
              {t}
            </button>
          ))}
        </div>

        {tab === "render" && rendered && (
          <div className="space-y-3 rounded border border-zinc-800 p-4">
            <p className="text-sm text-emerald-300/90">{rendered.headline}</p>
            {rendered.sections.map((s) => (
              <div key={s.title}>
                <h3 className="text-xs font-medium uppercase tracking-wide text-zinc-500">{s.title}</h3>
                <pre className="mt-1 whitespace-pre-wrap font-sans text-sm text-zinc-300">{s.body}</pre>
              </div>
            ))}
          </div>
        )}

        {tab === "json" && snapshot && (
          <pre className="max-h-[32rem] overflow-auto rounded border border-zinc-800 bg-zinc-900/80 p-3 text-xs text-zinc-300">
            {JSON.stringify(snapshot, null, 2)}
          </pre>
        )}

        {tab === "evidence" && snapshot && (
          <div className="space-y-4">
            {adapterStatuses.length > 0 && (
              <section className="rounded border border-zinc-800 p-3">
                <h3 className="mb-2 text-sm text-zinc-300">Adapter statuses</h3>
                <ul className="space-y-1 text-xs text-zinc-400">
                  {adapterStatuses.map((a) => (
                    <li key={a.sourceId}>
                      <span className="font-mono text-zinc-500">{a.status}</span> {a.sourceId} (
                      {a.lens}){a.notes ? ` — ${a.notes}` : ""}
                    </li>
                  ))}
                </ul>
              </section>
            )}
            <section className="rounded border border-zinc-800 p-3">
              <h3 className="mb-2 text-sm text-zinc-300">Evidence (origin / age)</h3>
              <ul className="space-y-2 text-sm text-zinc-400">
                {snapshot.evidence.map((e) => (
                  <li key={e.id}>
                    <span className="font-mono text-[10px] text-zinc-500">
                      {e.origin} · {e.sourceId} · age={e.ageMs}ms · {e.provider}
                    </span>
                    <div>{e.claim}</div>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        )}

        {tab === "capabilities" && (
          <ul className="space-y-2 rounded border border-zinc-800 p-3 text-sm text-zinc-300">
            {capabilities.map((c) => (
              <li key={c.sourceId}>
                <span className="font-mono text-xs text-zinc-500">{c.availability}</span>{" "}
                <strong>{c.lens}</strong> · {c.sourceId}
                {c.mentorEligible === false && (
                  <span className="ml-2 text-[10px] text-rose-400">mentorEligible=false</span>
                )}
                <div className="text-xs text-zinc-500">{c.notes}</div>
              </li>
            ))}
            {!capabilities.length && (
              <li className="text-zinc-600">Pulsá Manual Refresh para cargar capabilities.</li>
            )}
          </ul>
        )}
      </div>
    </div>
  );
}
