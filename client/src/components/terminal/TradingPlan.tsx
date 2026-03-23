import { TerminalPanel } from "./TerminalPanel";
import { useTerminalState } from "@/hooks/useTerminalState";
import { useTerminalAuth } from "@/contexts/TerminalAuthContext";
import { useEffect, useMemo, useRef, useState } from "react";
import { computePlaybook } from "@/lib/playbookEngine";
import { toast } from "@/hooks/use-toast";
import {
  buildPlaybookStateMachineContext,
  updatePlaybookStateWithDebug,
  type PlaybookState,
  type PlaybookStateMachineContext,
  type PlaybookStateMachineDebug,
} from "@/lib/playbookStateMachine";
import { buildTradingPlanPanelModel } from "@/lib/buildTradingPlanPanelModel";

function fmtK(n: number) {
  if (!Number.isFinite(n)) return "--";
  if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k`;
  return String(Math.round(n));
}

function bandTone(scoreTotal: number) {
  if (scoreTotal > 8) return "text-terminal-positive";
  if (scoreTotal > 7) return "text-terminal-accent";
  if (scoreTotal >= 5.5) return "text-terminal-accent/90";
  return "text-terminal-negative";
}

export function TradingPlan() {
  const { data: state } = useTerminalState();
  const { saasDisabled, access } = useTerminalAuth();
  const prevStateRef = useRef<any>(null);

  const fsmStateRef = useRef<PlaybookState>("NO_TRADE");
  const lastSwitchAtRef = useRef<number>(0);

  const [showDebug, setShowDebug] = useState(false);

  const nextFsm = useMemo(() => {
    if (!state) {
      return {
        fsmState: fsmStateRef.current,
        fsmContext: null as unknown as PlaybookStateMachineContext,
        fsmDebug: null as unknown as PlaybookStateMachineDebug,
      };
    }

    const ctx = buildPlaybookStateMachineContext(state, prevStateRef.current ?? undefined, {
      nowMs: Date.now(),
      lastSwitchAtMs: lastSwitchAtRef.current,
      cooldownMs: 8000,
    });
    const res = updatePlaybookStateWithDebug(fsmStateRef.current, ctx);
    return { fsmState: res.nextState, fsmContext: ctx, fsmDebug: res.debug };
  }, [state?.timestamp]);

  const playbook = useMemo(() => {
    if (!state) return null;
    return computePlaybook(state ?? null, prevStateRef.current ?? undefined, nextFsm.fsmState);
  }, [state?.timestamp, nextFsm.fsmState]); // eslint-disable-line react-hooks/exhaustive-deps

  const panelModel = useMemo(() => {
    if (!state || !playbook) return null;
    return buildTradingPlanPanelModel({
      currentState: state,
      prevState: prevStateRef.current,
      fsmState: nextFsm.fsmState,
      fsmContext: nextFsm.fsmContext,
      fsmDebug: nextFsm.fsmDebug,
      playbook,
      prevModel: null,
    });
  }, [state?.timestamp, nextFsm.fsmState, playbook]);

  useEffect(() => {
    if (!state) return;

    if (fsmStateRef.current !== nextFsm.fsmState) {
      const from = fsmStateRef.current;
      fsmStateRef.current = nextFsm.fsmState;
      lastSwitchAtRef.current = Date.now();

      const dbg = nextFsm.fsmDebug;
      if (dbg) {
        const trig = dbg.winningTrigger ?? (dbg.blockedTriggers[0] ? `blocked:${dbg.blockedTriggers[0]}` : "blocked");
        // eslint-disable-next-line no-console
        console.debug(
          `[PlaybookFSM] ${from} -> ${nextFsm.fsmState} | trigger=${trig} | acceptance=${dbg.acceptancePassed} | cooldown=${dbg.cooldownActive}`
        );
      }

      toast({
        title: `Playbook switched: ${from} → ${nextFsm.fsmState}`,
        description: "Decision panel updated.",
      });
    }

    prevStateRef.current = state;
  }, [state?.timestamp, nextFsm.fsmState]);

  if (!panelModel || !playbook)
    return (
      <TerminalPanel title="ACTIVE TRADING PLAN" className="flex-[0.65] min-w-[260px] min-h-0 max-[1200px]:min-w-[220px] max-[1000px]:min-w-0 max-[1000px]:flex-1">
        <div className="text-[10px] text-white/55 font-mono">Loading...</div>
      </TerminalPanel>
    );

  const session = panelModel.sessionContext;
  const ps = panelModel.preSetup;
  const tg = panelModel.tradeGate;
  const score = panelModel.score;
  const stateBlock = panelModel.playbookState;

  const preTone =
    ps?.status === "READY" || ps?.status === "ARMED"
      ? "text-terminal-accent"
      : ps?.status === "BLOCKED" || ps?.status === "INVALIDATED"
        ? "text-terminal-negative"
        : ps?.status === "ACTIVE"
          ? "text-terminal-positive"
          : "text-white/60";

  const sessionLines: string[] = [];
  if (session.pivot != null) sessionLines.push(`• Pivot: ${fmtK(session.pivot)}`);
  if (session.callWall != null) sessionLines.push(`• Call Wall: ${fmtK(session.callWall)}`);
  if (session.putWall != null) sessionLines.push(`• Put Wall: ${fmtK(session.putWall)}`);
  if (session.absorptionZone?.mid != null) sessionLines.push(`• Absorption: ${fmtK(session.absorptionZone.mid)}`);
  if (session.gammaFlip != null) sessionLines.push(`• Gamma Flip: ${fmtK(session.gammaFlip)}`);
  if (session.regime != null && session.dealerContext != null)
    sessionLines.push(`• Regime: ${session.regime} · ${session.dealerContext}`);

  const preConfirm = ps?.confirmationNeeded?.slice(0, 3) ?? [];

  const blockers = tg.blockers.filter(Boolean).slice(0, 3);

  const nearTriggers = (() => {
    const ctx = nextFsm.fsmContext;
    if (!ctx || !ctx.nearTriggers || !ctx.nearTriggerLevels) return [];
    const entries = [
      { k: "reclaimPivot", dist: ctx.nearTriggers.reclaimPivot, label: "Pivot", level: ctx.nearTriggerLevels.pivot },
      { k: "breakCallWall", dist: ctx.nearTriggers.breakCallWall, label: "Call Wall", level: ctx.nearTriggerLevels.callWall },
      { k: "breakPutWall", dist: ctx.nearTriggers.breakPutWall, label: "Put Wall", level: ctx.nearTriggerLevels.putWall },
      { k: "absorptionZone", dist: ctx.nearTriggers.absorptionZone, label: "Absorption", level: ctx.nearTriggerLevels.absorptionZone },
    ].filter((x) => typeof x.dist === "number" && Number.isFinite(x.dist)) as Array<{
      k: string;
      dist: number;
      label: string;
      level?: number;
    }>;
    entries.sort((a, b) => a.dist - b.dist);
    return entries.slice(0, 3);
  })();

  const subExpiryWarn = (() => {
    if (saasDisabled || !access?.subscription?.endsAt) return null;
    const end = new Date(access.subscription.endsAt).getTime();
    const days = (end - Date.now()) / 86400000;
    if (days > 3 || days < 0) return null;
    return `Subscription ends in ${Math.max(1, Math.ceil(days))} day(s).`;
  })();

  return (
    <TerminalPanel title="ACTIVE TRADING PLAN" className="flex-[0.65] min-w-[260px] min-h-0 max-[1200px]:min-w-[220px] max-[1000px]:min-w-0 max-[1000px]:flex-1">
      <div className="flex flex-col gap-3">
        {subExpiryWarn ? (
          <div className="text-[10px] font-mono text-amber-400/90 border border-amber-500/30 bg-amber-500/10 px-2 py-1 rounded-sm">
            {subExpiryWarn}
          </div>
        ) : null}
        {/* A) SESSION CONTEXT */}
        <div className="border border-white/[0.06] rounded-sm p-3">
          <div className="text-[10px] text-terminal-accent font-bold uppercase tracking-widest mb-2">SESSION CONTEXT</div>
          <div className="text-[10px] font-mono text-white/80 leading-snug whitespace-pre-wrap">
            {sessionLines.length > 0 ? sessionLines.join("\n") : "• (insufficient data)"}
          </div>
        </div>

        {/* B) PLAYBOOK STATE */}
        <div className="border border-white/[0.06] rounded-sm p-3">
          <div className="text-[10px] text-terminal-accent font-bold uppercase tracking-widest mb-2">PLAYBOOK STATE</div>
          <div className="text-[10px] font-mono text-white/85 leading-snug whitespace-pre-wrap">
            <div>State: {panelModel.playbookState.state}</div>
            <div>Bias: {panelModel.playbookState.bias}</div>
            <div>Main Trigger: {panelModel.playbookState.mainTrigger}</div>
            {panelModel.playbookState.keyLevel != null ? <div>Key Level: {fmtK(panelModel.playbookState.keyLevel)}</div> : null}
            <div>Cooldown: {panelModel.playbookState.cooldown}</div>
            <div>Confidence: {panelModel.playbookState.confidenceBand}</div>
            <div className="mt-1">Invalidation: {panelModel.playbookState.invalidation}</div>
          </div>
          <div className="mt-2 text-[10px] text-white/55 font-mono">{panelModel.playbookState.why}</div>
        </div>

        {/* C) PRE-SETUP */}
        {ps ? (
          <div className="border border-terminal-accent/15 rounded-sm p-3">
            <div className="text-[10px] text-terminal-accent font-bold uppercase tracking-widest mb-2">PRE-SETUP</div>
            <div className={`text-[10px] font-mono leading-snug whitespace-pre-wrap ${preTone}`}>
              <div>Type: {ps.type}</div>
              <div>Direction: {ps.direction}</div>
              <div>Status: {ps.status}</div>
              <div>Trigger Zone: {ps.triggerZone}</div>
              <div>Condition To Trigger: {ps.conditionToTrigger}</div>
              <div>Confirmation Needed: {preConfirm.join(" · ") || "—"}</div>
              <div className="mt-1">Invalidation: {ps.invalidation}</div>
              <div>Next Action: {ps.nextAction}</div>
            </div>
          </div>
        ) : null}

        {/* D) TRADE GATE */}
        <div className="border border-white/[0.06] rounded-sm p-3">
          <div className="text-[10px] text-terminal-accent font-bold uppercase tracking-widest mb-2">TRADE GATE</div>
          <div className="text-[10px] font-mono text-white/85 leading-snug whitespace-pre-wrap">
            <div>
              Status:{" "}
              <span className={tg.status === "TRADE VALID" ? "text-terminal-positive" : tg.status === "PREPARE" ? "text-terminal-accent" : tg.status === "INVALID" ? "text-terminal-negative" : "text-white/60"}>
                {tg.status}
              </span>
            </div>
            <div>Why: {tg.why}</div>
            <div>Blockers: {blockers.length > 0 ? blockers.join(" · ") : "none"}</div>
            <div>Entry Permission: {tg.entryPermission}</div>
          </div>
        </div>

        {/* E) SETUP SCORE */}
        <div className="border border-white/[0.06] rounded-sm p-3">
          <div className="text-[10px] text-terminal-accent font-bold uppercase tracking-widest mb-2">SETUP SCORE</div>
          <div className={`text-[10px] font-mono leading-snug whitespace-pre-wrap ${bandTone(score.total)}`}>
            <div>Total: {score.formatted}</div>
            <div>Location: {score.location.toFixed(1)}</div>
            <div>Flow: {score.flow.toFixed(1)}</div>
            <div>Acceptance: {score.acceptance.toFixed(1)}</div>
            <div>Context: {score.context.toFixed(1)}</div>
            <div>Risk Quality: {score.riskQuality.toFixed(1)}</div>
          </div>
          <div className="mt-2 text-[10px] text-white/55 font-mono">
            {score.total < 5.5 ? "No execution edge." : score.total <= 7 ? "Observation / prepare." : "Execution-quality context."}
          </div>
        </div>

        {/* Optional debug */}
        {showDebug ? (
          <div className="border border-white/[0.06] rounded-sm p-3">
            <div className="text-[10px] text-terminal-accent font-bold uppercase tracking-widest mb-2">DEBUG (FSM)</div>
            <div className="text-[10px] font-mono text-white/75 leading-snug whitespace-pre-wrap">
              {panelModel.debug ? (
                <>
                  <div>
                    {panelModel.debug.previousState} → {panelModel.debug.currentState}
                  </div>
                  <div>trigger={panelModel.debug.selectedTrigger ?? "blocked"}</div>
                  <div>acceptance={panelModel.debug.acceptancePassed ? "true" : "false"}</div>
                  <div>cooldown={panelModel.debug.cooldownActive ? "true" : "false"}</div>
                  <div>preSetup={panelModel.debug.preSetupStatus ?? "—"}</div>
                  <div>tradeGate={panelModel.debug.tradeGateStatus}</div>
                  <div>whyBlocked={panelModel.debug.whyBlocked || "—"}</div>
                  <div className="mt-2">nearTriggers:</div>
                  {nearTriggers.length > 0 ? (
                    nearTriggers
                      .map((x) => `${x.label} (${x.level != null ? fmtK(x.level) : "--"}): ${x.dist.toFixed(2)}% away`)
                      .join("\n")
                  ) : (
                    <div>—</div>
                  )}
                </>
              ) : (
                "—"
              )}
            </div>
          </div>
        ) : null}
      </div>
    </TerminalPanel>
  );
}

