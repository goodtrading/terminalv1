import type { VolatilityEngineOutput } from "@/lib/volatilityEngine";
import { directionalPressureLabel, volContextFromEngine } from "@/lib/volatilityEngine";
import { buildVolContextPanelState } from "@/lib/volatilityGammaContext";
import type { GammaInterpretationBundle } from "@/lib/volatilityGammaInterpretation";
import type { LiquidityInterpretationBundle } from "@/lib/volatilityLiquidityInterpretation";
import type { TerminalState } from "@/hooks/useTerminalState";
import type {
  VolatilityEngineState,
  VolTriggerZone,
  VolActionMode,
} from "@/lib/volatilityEnginePanelTypes";

function triggerAction(tone: VolTriggerZone["tone"], volState: VolatilityEngineOutput["volState"]): string {
  if (tone === "upside") {
    return volState === "EXPANDING"
      ? "Trail longs; do not add on first touch."
      : "Wait for acceptance, not first touch.";
  }
  if (tone === "downside") {
    return volState === "EXPANDING"
      ? "Trail shorts; confirm with sustained sell flow."
      : "Confirm with aggressive sell flow.";
  }
  return "Wait for displacement away from magnet.";
}

export function mapVolatilityEngineToPanelState(
  output: VolatilityEngineOutput,
  terminal?: TerminalState,
  gamma?: GammaInterpretationBundle,
  liquidity?: LiquidityInterpretationBundle,
): VolatilityEngineState {
  const compressionActive =
    output.volState === "COMPRESSED" || output.volState === "LOADED";

  const confirm = output.triggerConfirmation;
  const triggerZones: VolTriggerZone[] = [
    {
      id: "upside",
      label: "Upside Expansion Trigger",
      level: output.triggerZones.upsideExpansionTrigger,
      description: "Acceptance above this level can activate upside expansion.",
      action: triggerAction("upside", output.volState),
      tone: "upside",
      confirmation: confirm?.upside ?? "NONE",
    },
    {
      id: "downside",
      label: "Downside Expansion Trigger",
      level: output.triggerZones.downsideExpansionTrigger,
      description: "Acceptance below this level can activate downside expansion.",
      action: triggerAction("downside", output.volState),
      tone: "downside",
      confirmation: confirm?.downside ?? "NONE",
    },
    {
      id: "magnet",
      label: "Compression Magnet",
      level: output.triggerZones.compressionMagnet,
      description: "Avoid chasing around this zone while volatility is compressed.",
      action: triggerAction("neutral", output.volState),
      tone: "neutral",
    },
  ];

  const volContext = {
    ...buildVolContextPanelState(
      terminal,
      volContextFromEngine(output),
      gamma,
      liquidity,
    ),
    signalAlignment: output.signalAlignment?.replace(/_/g, " ") ?? "—",
    resolutionState: output.resolutionState?.replace(/_/g, " ") ?? "—",
    primaryConflict: output.primaryConflict ?? "—",
    resolutionHint: output.resolutionHint ?? "—",
  };

  return {
    executive: {
      headline: output.explanations.executiveDecision,
      subtext: output.explanations.executiveSubtext,
    },
    status: {
      volState: output.volState,
      cleanExpansion: output.cleanExpansionRiskLabel,
      tradeRisk: output.tradeRiskLabel,
      bias: output.directionalPressure,
      action: output.action as VolActionMode,
      riskSummary: output.riskSummary,
      gammaStripTag: output.gammaStripTag,
      liquidityStripTag: output.liquidityStripTag,
      conflictStripTag: output.conflictStripTag,
      signalAlignment: output.signalAlignment?.replace(/_/g, " ") ?? "—",
      resolutionState: output.resolutionState?.replace(/_/g, " ") ?? "—",
      executionBias: output.executionBias?.replace(/_/g, " ") ?? "—",
    },
    marketEnergy: {
      state: output.volState,
      summary: output.explanations.marketEnergyExplanation,
      cleanExpansionRiskPct: output.expansionRisk,
      lateChaseRisk: output.lateChaseRisk,
      reversalWatch: output.reversalWatch,
      tags: output.marketEnergyTags,
    },
    directionalPressure: {
      pressure: directionalPressureLabel(output, compressionActive),
      summary: output.explanations.directionalExplanation,
      warning: output.explanations.directionalWarning,
      tags: output.directionalTags,
    },
    triggerZones,
    expectedMove: {
      rows: [
        { horizon: "15m", points: output.expectedMove.m15 },
        { horizon: "1H", points: output.expectedMove.h1 },
        { horizon: "4H", points: output.expectedMove.h4 },
        { horizon: "Daily", points: output.expectedMove.daily },
      ],
      moveUsedPct: output.moveUsed,
      interpretation: output.explanations.expectedMoveInterpretation,
    },
    tradeQuality: {
      label: output.tradeQuality,
      score: output.tradeQualityScore,
      reasons: output.qualityReasons,
    },
    volContext,
    operationalPlaybook: mapOperationalPlaybook(output.playbook),
    finalPlaybook: {
      bestPlay: output.explanations.bestPlay,
      avoid: output.explanations.avoid,
      invalidation: output.explanations.invalidation,
      executionRule: output.explanations.executionRule,
    },
  };
}

function mapOperationalPlaybook(
  pb: VolatilityEngineOutput["playbook"],
): VolatilityEngineState["operationalPlaybook"] {
  const emptyScenario = (): VolatilityEngineState["operationalPlaybook"]["upsideScenario"] => ({
    scenarioStatus: "DISABLED",
    enabled: false,
    condition: "—",
    activationTrigger: "—",
    confirmation: "NONE",
    blockingReasons: [],
    targetPrimary: "—",
    targetSecondary: "—",
    targetExtended: "—",
    invalidation: "—",
  });

  const fallback: VolatilityEngineState["operationalPlaybook"] = {
    mode: "NO TRADE",
    headline: "NO TRADE — INSUFFICIENT CONTEXT",
    summary: "Playbook context is incomplete.",
    currentAction: "Stand aside.",
    upsideScenario: emptyScenario(),
    downsideScenario: emptyScenario(),
    avoid: ["Do not trade without live context."],
    nextCheckpoint: "Next checkpoint: wait for live data.",
  };
  if (!pb) return fallback;

  const mapScenario = (
    s: NonNullable<typeof pb>["upsideScenario"],
  ): VolatilityEngineState["operationalPlaybook"]["upsideScenario"] => ({
    scenarioStatus: (s.scenarioStatus ?? "DISABLED").replace(/_/g, " "),
    enabled: s.enabled,
    condition: s.condition || "—",
    activationTrigger: s.activationTrigger || "—",
    confirmation: s.confirmation || "NONE",
    blockingReasons: s.blockingReasons ?? [],
    targetPrimary: s.targetPrimary || "—",
    targetSecondary: s.targetSecondary || "—",
    targetExtended: s.targetExtended || "—",
    invalidation: s.invalidation || "—",
  });

  return {
    mode: pb.mode.replace(/_/g, " "),
    headline: pb.headline || fallback.headline,
    summary: pb.summary || fallback.summary,
    currentAction: pb.currentAction || fallback.currentAction,
    upsideScenario: mapScenario(pb.upsideScenario),
    downsideScenario: mapScenario(pb.downsideScenario),
    avoid: pb.avoid?.length ? pb.avoid : fallback.avoid,
    nextCheckpoint: pb.nextCheckpoint || fallback.nextCheckpoint,
  };
}
