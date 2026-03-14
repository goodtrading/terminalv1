import type { StateTimelineEntry } from "./stateTimeline";

export interface StateCoherenceSignal {
  state: "COHERENT" | "MIXED" | "FLAPPING";
  coherenceScore: number;
  flappingScore: number;
  alignmentScore: number;
  coherenceRead: string;
  reasons: string[];
  sampleWindow: number;
}

const MAX_SAMPLE_ENTRIES = 10;
const MIN_REQUIRED_ENTRIES = 3;

export function computeStateCoherence(timeline: StateTimelineEntry[]): StateCoherenceSignal {
  const sample = timeline
    .slice(0, MAX_SAMPLE_ENTRIES) // newest-first from getTimeline
    .filter(Boolean);

  const sampleWindow = sample.length;

  if (sampleWindow < MIN_REQUIRED_ENTRIES) {
    return {
      state: "MIXED",
      coherenceScore: 0,
      flappingScore: 0,
      alignmentScore: 0,
      coherenceRead: "Not enough history yet.",
      reasons: ["Timeline history is still building."],
      sampleWindow,
    };
  }

  let playbookChanges = 0;
  let biasFlips = 0;
  let resolutionChanges = 0;
  let pressureChanges = 0;
  let optionsRegimeChanges = 0;
  let confidenceDeltas: number[] = [];
  let alignedCount = 0;

  const n = sample.length;
  for (let i = 1; i < n; i++) {
    const prev = sample[i];
    const curr = sample[i - 1]; // newer

    if (prev.playbookState !== curr.playbookState) playbookChanges++;
    if (prev.resolutionState !== curr.resolutionState) resolutionChanges++;
    if (prev.pressureState !== curr.pressureState) pressureChanges++;
    if (
      prev.optionsGammaRegime !== curr.optionsGammaRegime ||
      prev.optionsRegimeQuality !== curr.optionsRegimeQuality
    ) {
      optionsRegimeChanges++;
    }

    if (
      prev.playbookBias &&
      curr.playbookBias &&
      prev.playbookBias !== curr.playbookBias &&
      prev.playbookBias !== "NEUTRAL" &&
      curr.playbookBias !== "NEUTRAL"
    ) {
      biasFlips++;
    }

    if (
      prev.playbookConfidence != null &&
      curr.playbookConfidence != null &&
      Number.isFinite(prev.playbookConfidence) &&
      Number.isFinite(curr.playbookConfidence)
    ) {
      confidenceDeltas.push(Math.abs(curr.playbookConfidence - prev.playbookConfidence));
    }

    // Simple alignment heuristic
    const aligned = isAligned(curr);
    if (aligned) alignedCount++;
  }

  const avgConfidenceDelta =
    confidenceDeltas.length > 0
      ? confidenceDeltas.reduce((a, b) => a + b, 0) / confidenceDeltas.length
      : 0;

  const alignedRatio = alignedCount / (n - 1);

  // Normalize change counts
  const normPlaybookChanges = Math.min(playbookChanges / (n - 1), 1);
  const normBiasFlips = Math.min(biasFlips / (n - 1), 1);
  const normResolutionChanges = Math.min(resolutionChanges / (n - 1), 1);
  const normPressureChanges = Math.min(pressureChanges / (n - 1), 1);
  const normOptionsRegimeChanges = Math.min(optionsRegimeChanges / (n - 1), 1);
  const normConfDelta = Math.min(avgConfidenceDelta / 30, 1); // 30pt avg jump ~ max

  const flappingComposite =
    0.3 * normPlaybookChanges +
    0.2 * normBiasFlips +
    0.15 * normResolutionChanges +
    0.15 * normPressureChanges +
    0.1 * normOptionsRegimeChanges +
    0.1 * normConfDelta;

  const flappingScore = Math.round(flappingComposite * 100);
  const alignmentScore = Math.round(alignedRatio * 100);

  const coherenceScore = Math.round(
    0.6 * alignmentScore / 100 +
      0.4 * (1 - flappingComposite) // favor low flapping
  * 100
  );

  let state: StateCoherenceSignal["state"] = "MIXED";
  if (flappingScore >= 65 && coherenceScore <= 50) {
    state = "FLAPPING";
  } else if (coherenceScore >= 70 && alignmentScore >= 60 && flappingScore <= 40) {
    state = "COHERENT";
  }

  const reasons: string[] = [];
  if (state === "COHERENT") {
    reasons.push("Recent transitions form a stable narrative.");
    if (alignedRatio > 0.7) {
      reasons.push("Playbook, pressure, and resolution are mostly aligned.");
    }
    if (flappingScore < 30) {
      reasons.push("Few conflicting reversals or bias flips.");
    }
  } else if (state === "FLAPPING") {
    if (playbookChanges > 2) {
      reasons.push(`Playbook changed ${playbookChanges} times in the recent window.`);
    }
    if (biasFlips > 0) {
      reasons.push("Directional bias flipped repeatedly.");
    }
    if (optionsRegimeChanges > 0) {
      reasons.push("Options regime/quality shifted multiple times recently.");
    }
  } else {
    reasons.push("Recent transitions are mixed; structure is still resolving.");
    if (alignedRatio < 0.5) {
      reasons.push("Options and microstructure are not fully aligned yet.");
    }
  }

  const coherenceRead =
    state === "COHERENT"
      ? "Recent transitions are aligned; current playbook is behaving coherently."
      : state === "FLAPPING"
      ? "State changes are unstable; current read may be noisy."
      : "Recent transitions are mixed; structure is still resolving.";

  return {
    state,
    coherenceScore: Math.max(0, Math.min(100, coherenceScore)),
    flappingScore: Math.max(0, Math.min(100, flappingScore)),
    alignmentScore: Math.max(0, Math.min(100, alignmentScore)),
    coherenceRead,
    reasons,
    sampleWindow,
  };
}

function isAligned(entry: StateTimelineEntry): boolean {
  // Very lightweight alignment heuristic:
  // - If playbook is breakout/acceptance oriented, prefer PRESSING/ACCEPTING_IN_ZONE and SHORT_GAMMA.
  // - If playbook is fade/reversal oriented, prefer REJECTED_CLEAN/DEFENSE_HOLDING and LONG_GAMMA.

  const pb = entry.playbookState || "";
  const bias = entry.playbookBias || "NEUTRAL";
  const res = entry.resolutionState || "";
  const pressure = entry.pressureState || "";
  const optRegime = entry.optionsGammaRegime || "NEUTRAL";

  const breakoutLike =
    pb.includes("BREAKOUT") ||
    pb.includes("ACCEPTANCE") ||
    pb.includes("DO_NOT_FADE");
  const fadeLike =
    pb.includes("FADE") ||
    pb.includes("REVERSAL") ||
    pb.includes("FAILED_BREAK");

  if (breakoutLike) {
    if (
      (pressure.includes("PRESS") || res.includes("ACCEPT")) &&
      optRegime === "SHORT_GAMMA"
    ) {
      return true;
    }
  }

  if (fadeLike) {
    if (
      (res.includes("REJECTED") || pressure.includes("DEFENSE_HOLDING")) &&
      optRegime === "LONG_GAMMA"
    ) {
      return true;
    }
  }

  // Otherwise, treat as neutral/mixed (not explicitly aligned)
  return false;
}

