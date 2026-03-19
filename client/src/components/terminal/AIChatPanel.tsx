import { useEffect, useMemo, useRef, useState } from "react";
import { useTerminalState } from "@/hooks/useTerminalState";

type ChatRole = "user" | "assistant";

type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  timestamp: number;
  kind?: "autoAlert";
};

type VisualTone = "green" | "red" | "yellow";
type VisualTag = {
  key: "gammaRegime" | "structure" | "playstyle";
  label: string;
  tone: VisualTone;
};

function makeId(): string {
  // Prefer stable browser UUIDs when available.
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `msg_${Math.random().toString(16).slice(2)}_${Date.now()}`;
}

function extractVisualRegimeTags(aiText: string): VisualTag[] {
  const t = aiText.toUpperCase();

  // 1) Gamma regime
  let gammaRegime: VisualTag["label"] | undefined;
  let gammaTone: VisualTone | undefined;
  if (/\bSHORT\s*GAMMA\b/.test(t) || /\bGAMMA\s*CORTA\b/.test(t)) {
    gammaRegime = "SHORT GAMMA";
    gammaTone = "red";
  } else if (/\bLONG\s*GAMMA\b/.test(t) || /\bGAMMA\s+LAR(GA|GO)\b/.test(t)) {
    gammaRegime = "LONG GAMMA";
    gammaTone = "green";
  }

  // 2) Structure
  // Prefer TRANSITION when it's present; otherwise decide between RANGE vs BREAKOUT/EXPANSION.
  let structure: VisualTag["label"] | undefined;
  let structureTone: VisualTone | undefined;
  const isTransition = /\bTRANSIC(ION|IÓN)\b|\bTRANSITION\b/.test(t) || /\bGAMMA\s*FLIP\b/.test(t);
  if (isTransition) {
    structure = "TRANSITION";
    structureTone = "yellow";
  } else {
    const isRange =
      /\bRANGO\b/.test(t) ||
      /\bRANGE\b/.test(t) ||
      /\bREVERSI[ÓO]N\s*A\s*LA\s*MEDIA\b/.test(t) ||
      /\bREVERSI[ÓO]N\s+MEDIA\b/.test(t) ||
      /\bMEAN\s*REVERSION\b/.test(t) ||
      /\bREVERSION\s+MEDIA\b/.test(t);
    const isBreakout =
      /\bBREAKOUT\b/.test(t) || /\bRUPTURA\b/.test(t) || /\bEXPANSION\b/.test(t) || /\bEXPANSIÓN\b/.test(t);

    if (isRange) {
      structure = "RANGO";
      structureTone = "green";
    } else if (isBreakout) {
      structure = "BREAKOUT";
      structureTone = "yellow";
    }
  }

  // 3) Playstyle
  let playstyle: VisualTag["label"] | undefined;
  let playstyleTone: VisualTone | undefined;
  const isMomentum =
    /\bMOMENTUM\b/.test(t) ||
    /\bIMPULSO\b/.test(t) ||
    /\bCONTINUACI(ON|ÓN)\b/.test(t) ||
    /\bEXPANSION\b/.test(t) ||
    /\bEXPANSIÓN\b/.test(t) ||
    /\bACELERAD/.test(t);
  const isFade =
    /\bFADE\b/.test(t) ||
    /\bFADING\b/.test(t) ||
    /\bREVERT\b/.test(t) ||
    /\bRETROCESO\b/.test(t) ||
    /\bREVERSI[ÓO]N\s*A\s*LA\s*MEDIA\b/.test(t) ||
    /\bMEAN\s*REVERSION\b/.test(t);

  if (isMomentum) {
    playstyle = "MOMENTUM";
    playstyleTone = "green";
  } else if (isFade) {
    playstyle = "FADE";
    playstyleTone = "red";
  }

  const tags: VisualTag[] = [];
  if (gammaRegime && gammaTone) tags.push({ key: "gammaRegime", label: gammaRegime, tone: gammaTone });
  if (structure && structureTone) tags.push({ key: "structure", label: structure, tone: structureTone });
  if (playstyle && playstyleTone) tags.push({ key: "playstyle", label: playstyle, tone: playstyleTone });
  return tags;
}

function VisualBadge({ label, tone }: { label: string; tone: VisualTone }) {
  const classes =
    tone === "green"
      ? "border-green-500/30 bg-green-500/10 text-green-200"
      : tone === "red"
        ? "border-red-500/30 bg-red-500/10 text-red-200"
        : "border-yellow-500/30 bg-yellow-500/10 text-yellow-100";
  return <span className={`inline-flex items-center px-2 py-0.5 rounded border text-[10px] font-bold ${classes}`}>{label}</span>;
}

type DetectorGammaSide = "LONG" | "SHORT";
type DetectorStructureTag = "RANGE" | "BREAKOUT" | "TRANSITION";

type AutoAlertEventType =
  | "GAMMA_SHIFT_LONG_TO_SHORT"
  | "GAMMA_SHIFT_SHORT_TO_LONG"
  | "CALL_WALL_BREAK"
  | "PUT_WALL_BREAK"
  | "PIVOT_BREAK"
  | "STRUCTURE_BREAKOUT"
  | "STRUCTURE_ACCELERATION"
  | "NEAR_GAMMA_FLIP"
  | "NEAR_ABSORPTION_LEVEL";

function normalizeGammaSide(v: unknown): DetectorGammaSide | null {
  if (typeof v !== "string") return null;
  const s = v.toUpperCase();
  if (/\bSHORT\s*GAMMA\b/.test(s)) return "SHORT";
  if (/\bLONG\s*GAMMA\b/.test(s)) return "LONG";
  return null;
}

function deriveStructureTag(positioning: any, market: any): DetectorStructureTag {
  const squeeze = positioning?.squeezeProbabilityEngine;
  const cascade = positioning?.liquidityCascadeEngine;
  const bias = positioning?.institutionalBiasEngine;
  const volExp = positioning?.volatilityExpansionDetector;

  if (squeeze?.squeezeProbability >= 60 || cascade?.cascadeRisk === "EXTREME") return "BREAKOUT";
  if (volExp?.volExpansionState === "EXPANDING" || bias?.institutionalBias?.includes("EXPANSION")) return "BREAKOUT";
  if (bias?.institutionalBias === "FRAGILE_TRANSITION" || market?.gammaRegime === "TRANSITION") return "TRANSITION";
  return "RANGE";
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function isNearPrice(spot: number | undefined, target: number | undefined, pct: number) {
  if (!isFiniteNumber(spot) || !isFiniteNumber(target) || spot === 0) return false;
  return Math.abs(spot - target) / spot <= pct;
}

export function AIChatPanel() {
  const MAX_MESSAGES = 30;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [includeLiveContext, setIncludeLiveContext] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [errorState, setErrorState] = useState<{ error?: string; details?: string } | null>(null);

  const { data: terminalState } = useTerminalState();

  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // Keep newest message in view.
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, isLoading]);

  const canSend = useMemo(() => draft.trim().length > 0 && !isLoading, [draft, isLoading]);

  const AUTO_ALERT_MIN_INTERVAL_MS = 30_000; // debounce: max 1 alert per interval
  const NEAR_PCT = 0.0025; // 0.25% proximity band for gammaFlip / absorption

  type DetectorSnapshot = {
    spot?: number;
    gammaSide?: DetectorGammaSide | null;
    structureTag?: DetectorStructureTag;
    accelerationActive?: boolean;
    callWall?: number;
    putWall?: number;
    pivot?: number;
    gammaFlip?: number;
    absorptionLevel?: number;
    gammaFlipNear?: boolean;
    absorptionNear?: boolean;
  };

  const prevDetectorSnapshotRef = useRef<DetectorSnapshot | null>(null);
  const lastAutoTriggerAtRef = useRef<number>(0);
  const lastAutoEventTypeRef = useRef<AutoAlertEventType | null>(null);
  const autoAlertInFlightRef = useRef<boolean>(false);

  const buildCompactContext = (s: any) => {
    const market = s?.market ?? {};
    const exposure = s?.exposure ?? {};
    const positioning = s?.positioning ?? {};
    const gravityMap = s?.gravityMap ?? {};

    const compact: Record<string, unknown> = {};

    const addNumber = (key: string, v: unknown) => {
      if (typeof v === "number" && Number.isFinite(v)) compact[key] = v;
    };
    const addString = (key: string, v: unknown) => {
      if (typeof v === "string" && v.trim().length > 0) compact[key] = v;
    };

    addNumber("spot", s?.options?.spot ?? s?.ticker?.price ?? market?.spot);
    addString("gammaState", market?.gammaRegime ?? s?.options?.gammaRegime);
    addNumber("gammaFlip", market?.gammaFlip);
    addNumber("flipDistancePct", market?.distanceToFlip);

    addNumber("callWall", positioning?.callWall);
    addNumber("putWall", positioning?.putWall);
    addNumber("activeCallWall", positioning?.activeCallWall);
    addNumber("activePutWall", positioning?.activePutWall);

    addNumber("pivot", positioning?.dealerPivot);

    // magnet (compact)
    const primaryMagnetPrice = gravityMap?.primaryMagnet?.price;
    const secondaryMagnetPrice = gravityMap?.secondaryMagnet?.price;
    if (typeof primaryMagnetPrice === "number" && Number.isFinite(primaryMagnetPrice)) {
      compact.magnet = {
        primary: primaryMagnetPrice,
        ...(typeof secondaryMagnetPrice === "number" && Number.isFinite(secondaryMagnetPrice)
          ? { secondary: secondaryMagnetPrice }
          : {}),
      };
    }

    // dealers (compact)
    addNumber("vannaExposure", exposure?.vannaExposure);
    addNumber("charmExposure", exposure?.charmExposure);
    addString("dealers", exposure?.vannaBias && exposure?.charmBias ? `${exposure.vannaBias}/${exposure.charmBias}` : undefined);
    addString("marketMode", positioning?.marketModeEngine?.marketMode ?? positioning?.marketMode);
    addString("structure", gravityMap?.summary ?? gravityMap?.status);

    // absorption summary
    const absorption = positioning?.absorption;
    if (absorption && typeof absorption === "object") {
      const conf = absorption?.confidence;
      if (typeof conf === "number" && Number.isFinite(conf)) compact.absorptionConfidence = conf;

      const level =
        absorption?.referencePrice ??
        (typeof absorption?.zoneLow === "number" && typeof absorption?.zoneHigh === "number" && Number.isFinite(absorption.zoneLow) && Number.isFinite(absorption.zoneHigh)
          ? (absorption.zoneLow + absorption.zoneHigh) / 2
          : undefined);
      if (typeof level === "number" && Number.isFinite(level)) compact.absorptionLevel = level;
    }

    return compact;
  };

  useEffect(() => {
    if (!terminalState) return;

    const ctx = buildCompactContext(terminalState);

    const currSpot = typeof ctx.spot === "number" && Number.isFinite(ctx.spot) ? ctx.spot : undefined;
    const currGammaSide = normalizeGammaSide(typeof ctx.gammaState === "string" ? ctx.gammaState : undefined);

    const positioning = terminalState.positioning ?? {};
    const market = terminalState.market ?? {};

    const currStructureTag = deriveStructureTag(positioning, market);
    const currAccelerationActive =
      positioning?.dealerHedgingFlowMap?.hedgingAccelerationRisk === "HIGH";

    const currCallWall = typeof ctx.callWall === "number" && Number.isFinite(ctx.callWall) ? ctx.callWall : undefined;
    const currPutWall = typeof ctx.putWall === "number" && Number.isFinite(ctx.putWall) ? ctx.putWall : undefined;
    const currPivot = typeof ctx.pivot === "number" && Number.isFinite(ctx.pivot) ? ctx.pivot : undefined;

    const currGammaFlip = typeof ctx.gammaFlip === "number" && Number.isFinite(ctx.gammaFlip) ? ctx.gammaFlip : undefined;
    const currAbsorptionLevel = typeof ctx.absorptionLevel === "number" && Number.isFinite(ctx.absorptionLevel) ? ctx.absorptionLevel : undefined;

    const currGammaFlipNear = isNearPrice(currSpot, currGammaFlip, NEAR_PCT);
    const currAbsorptionNear = isNearPrice(currSpot, currAbsorptionLevel, NEAR_PCT);

    const curr: DetectorSnapshot = {
      spot: currSpot,
      gammaSide: currGammaSide,
      structureTag: currStructureTag,
      accelerationActive: currAccelerationActive,
      callWall: currCallWall,
      putWall: currPutWall,
      pivot: currPivot,
      gammaFlip: currGammaFlip,
      absorptionLevel: currAbsorptionLevel,
      gammaFlipNear: currGammaFlipNear,
      absorptionNear: currAbsorptionNear,
    };

    const prev = prevDetectorSnapshotRef.current;
    prevDetectorSnapshotRef.current = curr;
    if (!prev) return;

    if (autoAlertInFlightRef.current || isLoading) return;

    const now = Date.now();
    if (now - lastAutoTriggerAtRef.current < AUTO_ALERT_MIN_INTERVAL_MS) return;

    const tryTrigger = async (eventType: AutoAlertEventType, eventLabel: string) => {
      autoAlertInFlightRef.current = true;
      lastAutoTriggerAtRef.current = Date.now();
      lastAutoEventTypeRef.current = eventType;

      const message = `Analyze the new market condition after this event: ${eventType}`;

      try {
        const resp = await fetch("/api/ai/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            message,
            includeLiveContext: false,
            marketContext: ctx,
          }),
        });

        if (!resp.ok) {
          const body = await resp.json().catch(() => ({}));
          throw new Error(typeof body?.details === "string" ? body.details : `Request failed: ${resp.status}`);
        }

        const data = (await resp.json()) as { response?: string };
        const aiText = typeof data?.response === "string" && data.response.trim().length > 0 ? data.response : "--";

        const assistantMsg: ChatMessage = {
          id: makeId(),
          role: "assistant",
          kind: "autoAlert",
          content: `⚠️ EVENT: ${eventLabel}\n${aiText}`,
          timestamp: Date.now(),
        };

        setMessages((mPrev) => [...mPrev, assistantMsg].slice(-MAX_MESSAGES));
      } catch (e: any) {
        const details = e instanceof Error ? e.message : "Auto alert AI request failed";
        const assistantMsg: ChatMessage = {
          id: makeId(),
          role: "assistant",
          kind: "autoAlert",
          content: `⚠️ EVENT: ${eventLabel}\nAI error: ${details}`,
          timestamp: Date.now(),
        };
        setMessages((mPrev) => [...mPrev, assistantMsg].slice(-MAX_MESSAGES));
      } finally {
        autoAlertInFlightRef.current = false;
      }
    };

    const gammaShiftEvent: { eventType: AutoAlertEventType; eventLabel: string } | null = (() => {
      if (!prev.gammaSide || !curr.gammaSide) return null;
      if (prev.gammaSide === curr.gammaSide) return null;
      if (prev.gammaSide === "LONG" && curr.gammaSide === "SHORT") {
        return { eventType: "GAMMA_SHIFT_LONG_TO_SHORT", eventLabel: "GAMMA SHIFT" };
      }
      if (prev.gammaSide === "SHORT" && curr.gammaSide === "LONG") {
        return { eventType: "GAMMA_SHIFT_SHORT_TO_LONG", eventLabel: "GAMMA SHIFT" };
      }
      return null;
    })();

    // Priority order: gamma shift -> level breaks -> structural change -> critical proximity
    const eventCandidate: { eventType: AutoAlertEventType; eventLabel: string } | null = gammaShiftEvent
      ? gammaShiftEvent
      : (() => {
          if (isFiniteNumber(prev.callWall) && isFiniteNumber(curr.callWall) && isFiniteNumber(prev.spot) && isFiniteNumber(currSpot)) {
            const prevDiff = prev.spot - prev.callWall;
            const currDiff = currSpot - curr.callWall;
            if (prevDiff <= 0 && currDiff > 0) return { eventType: "CALL_WALL_BREAK" as AutoAlertEventType, eventLabel: "CALL WALL BREAK" };
          }
          if (isFiniteNumber(prev.putWall) && isFiniteNumber(curr.putWall) && isFiniteNumber(prev.spot) && isFiniteNumber(currSpot)) {
            const prevDiff = prev.spot - prev.putWall;
            const currDiff = currSpot - curr.putWall;
            if (prevDiff >= 0 && currDiff < 0) return { eventType: "PUT_WALL_BREAK" as AutoAlertEventType, eventLabel: "PUT WALL BREAK" };
          }
          if (isFiniteNumber(prev.pivot) && isFiniteNumber(curr.pivot) && isFiniteNumber(prev.spot) && isFiniteNumber(currSpot)) {
            const prevDiff = prev.spot - prev.pivot;
            const currDiff = currSpot - curr.pivot;
            if ((prevDiff < 0 && currDiff >= 0) || (prevDiff > 0 && currDiff <= 0)) {
              return { eventType: "PIVOT_BREAK" as AutoAlertEventType, eventLabel: "PIVOT BREAK" };
            }
          }

          if (prev.structureTag === "RANGE" && curr.structureTag === "BREAKOUT") {
            return { eventType: "STRUCTURE_BREAKOUT" as AutoAlertEventType, eventLabel: "STRUCTURE BREAKOUT" };
          }

          if (prev.structureTag === "RANGE" && !prev.accelerationActive && curr.accelerationActive) {
            return { eventType: "STRUCTURE_ACCELERATION" as AutoAlertEventType, eventLabel: "ACCELERATION" };
          }

          if (!prev.gammaFlipNear && curr.gammaFlipNear) {
            return { eventType: "NEAR_GAMMA_FLIP" as AutoAlertEventType, eventLabel: "NEAR GAMMA FLIP" };
          }
          if (!prev.absorptionNear && curr.absorptionNear) {
            return { eventType: "NEAR_ABSORPTION_LEVEL" as AutoAlertEventType, eventLabel: "NEAR ABSORPTION" };
          }

          return null;
        })();

    if (!eventCandidate) return;

    void tryTrigger(eventCandidate.eventType, eventCandidate.eventLabel);
  }, [terminalState?.timestamp]); // eslint-disable-line react-hooks/exhaustive-deps

  const sendMessage = async (
    text: string,
    opts?: { includeLiveContextOverride?: boolean; marketContext?: any | Promise<any> }
  ) => {
    const includeLiveContextPayload =
      typeof opts?.includeLiveContextOverride === "boolean" ? opts!.includeLiveContextOverride : includeLiveContext;
    const trimmed = text.trim();
    if (!trimmed) return;
    if (isLoading) return;
    setErrorState(null);
    setIsLoading(true);

    const userMsg: ChatMessage = {
      id: makeId(),
      role: "user",
      content: trimmed,
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMsg].slice(-MAX_MESSAGES));
    if (trimmed === draft.trim()) setDraft("");

    const resolvedMarketContext =
      opts?.marketContext && typeof (opts.marketContext as any)?.then === "function"
        ? await (opts.marketContext as Promise<any>).catch(() => undefined)
        : opts?.marketContext;

    try {
      const resp = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message: trimmed,
          includeLiveContext: includeLiveContextPayload,
          ...(resolvedMarketContext ? { marketContext: resolvedMarketContext } : {}),
        }),
      });

      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        const errCode = typeof body?.error === "string" ? body.error : undefined;
        const details =
          typeof body?.details === "string"
            ? body.details
            : typeof body?.message === "string"
              ? body.message
              : `Request failed: ${resp.status}`;
        const err = new Error(errCode ? `${errCode}: ${details}` : details);
        (err as any).code = errCode;
        (err as any).details = details;
        throw err;
      }

      const data = (await resp.json()) as { response?: string };
      const response = typeof data?.response === "string" ? data.response : "--";

      const assistantMsg: ChatMessage = {
        id: makeId(),
        role: "assistant",
        content: response,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, assistantMsg].slice(-MAX_MESSAGES));
    } catch (e: any) {
      const raw = e instanceof Error ? e.message : "AI request failed";
      const code = typeof e?.code === "string" ? e.code : undefined;
      const details = typeof e?.details === "string" ? e.details : undefined;

      // Friendly mapping for the most common case.
      if (!code && raw === "OPENAI_API_KEY_MISSING") {
        setErrorState({
          error: "OPENAI_API_KEY_MISSING",
          details: "OPENAI_API_KEY is missing on the server. Add it to .env and restart.",
        });
      } else {
        setErrorState({
          error: code ?? "AI_CHAT_ERROR",
          details: details ?? raw,
        });
      }
      setMessages((prev) =>
        [
          ...prev,
          {
            id: makeId(),
            role: "assistant",
            content:
              `Error: ${code ?? "AI_CHAT_ERROR"}\n` +
              `${typeof (e?.details) === "string" ? (e.details as string) : raw}`,
            timestamp: Date.now(),
          },
        ].slice(-MAX_MESSAGES)
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-2 h-full min-h-0">
      <div className="flex items-center justify-between gap-2">
        <button
          className={`text-[10px] px-2 py-1 rounded border transition-colors ${
            includeLiveContext ? "border-green-500/30 bg-green-500/10 text-green-200" : "border-white/15 bg-white/5 text-white/60"
          }`}
          onClick={() => setIncludeLiveContext((v) => !v)}
          type="button"
        >
          Use Live Context: {includeLiveContext ? "ON" : "OFF"}
        </button>

        <div className="text-[10px] font-mono text-white/40">
          {isLoading ? "Analyzing…" : `${messages.length} msgs`}
        </div>
      </div>

      <div
        ref={listRef}
        className="border border-white/10 rounded bg-black/20 overflow-y-auto flex-1 min-h-0"
      >
        <div className="p-2 flex flex-col gap-2">
          {messages.length === 0 ? (
            <div className="text-[10px] text-white/40 font-mono leading-snug">
              Ask for an institutional gamma/liquidity/dealer analysis. Turn <span className="text-white/60">Live Context</span> ON to include current terminal state.
            </div>
          ) : null}

          {messages.map((m) => (
            <div
              key={m.id}
              className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[92%] whitespace-pre-wrap break-words rounded px-2 py-1 border ${
                  m.role === "user"
                    ? "border-white/15 bg-white/5 text-white/90"
                    : m.role === "assistant" && m.kind === "autoAlert"
                      ? "border-yellow-500/50 bg-yellow-500/10 text-yellow-100 animate-pulse"
                      : "border-white/10 bg-black/30 text-white/80"
                }`}
              >
                <div className="text-[9px] text-white/40 font-mono mb-0.5">
                  {m.role === "user" ? "YOU" : m.kind === "autoAlert" ? "AI (AUTO)" : "AI"} ·{" "}
                  {new Date(m.timestamp).toLocaleTimeString(undefined, { hour12: false })}
                </div>
                {m.role === "assistant" ? (
                  <div className="flex flex-wrap gap-1 mb-1">
                    {extractVisualRegimeTags(m.content).map((tag) => (
                      <VisualBadge key={tag.key} label={tag.label} tone={tag.tone} />
                    ))}
                  </div>
                ) : null}
                <div className="text-[11px] leading-snug">{m.content}</div>
              </div>
            </div>
          ))}

          {errorState ? (
            <div className="text-[10px] text-red-300 font-mono flex flex-col gap-1">
              <div>Error: {errorState.error ?? "AI_CHAT_ERROR"}</div>
              {errorState.details ? (
                <div className="whitespace-pre-wrap text-white/70">
                  {errorState.details}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      <div className="flex gap-2 items-end">
        <div className="flex flex-col gap-1 flex-1 min-w-0">
          <div className="flex gap-2">
            <QuickButton
              label="Analyze Regime"
              onClick={() =>
                sendMessage("Analizá el régimen actual del mercado usando el contexto provisto y explicá cuál es la mejor jugada.", {
                  includeLiveContextOverride: true,
                  marketContext: (async () => {
                    // Fetch terminal state only on-demand (avoid rerenders/tick updates).
                    const res = await fetch("/api/terminal/state");
                    if (!res.ok) return undefined;
                    const s = await res.json().catch(() => null);
                    return s ? buildCompactContext(s) : undefined;
                  })(),
                })
              }
              disabled={isLoading}
            />
            <QuickButton
              label="Build Trade Plan"
              onClick={() =>
                sendMessage("Construí un plan táctico de trading basado en el contexto actual del mercado.")
              }
              disabled={isLoading}
            />
            <QuickButton
              label="Risk Check"
              onClick={() =>
                sendMessage("Evaluá el entorno de riesgo actual usando el contexto provisto.")
              }
              disabled={isLoading}
            />
          </div>

        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Ask about gamma, liquidity, regime..."
          rows={3}
          className="flex-1 resize-none border border-white/10 bg-black/20 rounded px-2 py-1 text-[11px] text-white/80 outline-none focus:border-white/20"
          disabled={isLoading}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
              e.preventDefault();
              if (canSend) sendMessage(draft);
            }
          }}
        />
        </div>
        <button
          type="button"
          className={`px-3 py-2 rounded border text-[11px] font-bold transition-colors ${
            canSend ? "border-green-500/40 bg-green-500/15 text-green-200" : "border-white/10 bg-white/5 text-white/40"
          }`}
          onClick={() => sendMessage(draft)}
          disabled={!canSend}
        >
          <span className="inline-flex items-center gap-2">
            {isLoading ? <span className="inline-block w-3 h-3 border border-white/30 border-t-white/60 rounded-full animate-spin" /> : null}
            {isLoading ? "Analyzing" : "Send"}
          </span>
        </button>
      </div>
    </div>
  );
}

function QuickButton({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="text-[10px] px-2 py-1 rounded border border-white/10 bg-white/5 text-white/70 hover:text-white/90 disabled:opacity-50"
    >
      {label}
    </button>
  );
}

