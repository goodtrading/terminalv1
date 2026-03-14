export interface StateTimelineEntry {
  timestamp: number;
  isoTime: string;

  spot: number | null;

  optionsGammaRegime: "LONG_GAMMA" | "SHORT_GAMMA" | "NEUTRAL" | null;
  optionsRegimeQuality: "CLEAN" | "MIXED" | "WEAK" | null;
  optionsMagnetBias: "UP" | "DOWN" | "NEUTRAL" | null;

  marketGammaRegime: string | null;

  absorptionStatus: string | null;
  absorptionSide: string | null;

  pressureState: string | null;
  defenseHealth: number | null;

  resolutionState: string | null;

  playbookState: string | null;
  playbookBias: "LONG" | "SHORT" | "NEUTRAL" | null;
  playbookConfidence: number | null;

  transitionLabel: string;
}

interface UpdateTimelineArgs {
  spot: number | null;
  optionsGammaRegime: StateTimelineEntry["optionsGammaRegime"];
  optionsRegimeQuality: StateTimelineEntry["optionsRegimeQuality"];
  optionsMagnetBias: StateTimelineEntry["optionsMagnetBias"];
  marketGammaRegime: string | null;
  absorptionStatus: string | null;
  absorptionSide: string | null;
  pressureState: string | null;
  defenseHealth: number | null;
  resolutionState: string | null;
  playbookState: string | null;
  playbookBias: StateTimelineEntry["playbookBias"];
  playbookConfidence: number | null;
  now: number;
}

const MAX_ENTRIES = 200;
const CONFIDENCE_JUMP_THRESHOLD = 10;
const DEBOUNCE_MS = 5000;

const timeline: StateTimelineEntry[] = [];
let lastEntry: StateTimelineEntry | null = null;

function buildTransitionLabel(prev: StateTimelineEntry | null, curr: StateTimelineEntry): string {
  const changes: string[] = [];

  if (!prev) {
    return "Initial state";
  }

  if (prev.playbookState !== curr.playbookState) {
    const biasPart = curr.playbookBias ? ` (${curr.playbookBias})` : "";
    changes.push(`Playbook → ${curr.playbookState}${biasPart}`);
  }

  if (prev.resolutionState !== curr.resolutionState && curr.resolutionState) {
    changes.push(`Resolution → ${curr.resolutionState}`);
  }

  if (prev.pressureState !== curr.pressureState && curr.pressureState) {
    changes.push(`Pressure → ${curr.pressureState}`);
  }

  if (
    (prev.optionsGammaRegime !== curr.optionsGammaRegime ||
      prev.optionsRegimeQuality !== curr.optionsRegimeQuality) &&
    curr.optionsGammaRegime
  ) {
    const qual = curr.optionsRegimeQuality ?? "";
    changes.push(
      `Options regime → ${curr.optionsGammaRegime}${qual ? "/" + qual : ""}`
    );
  }

  if (prev.absorptionStatus !== curr.absorptionStatus && curr.absorptionStatus) {
    const sidePart = curr.absorptionSide ? " " + curr.absorptionSide : "";
    changes.push(`Absorption → ${curr.absorptionStatus}${sidePart}`);
  }

  if (
    prev.playbookConfidence != null &&
    curr.playbookConfidence != null &&
    Math.abs(curr.playbookConfidence - prev.playbookConfidence) >= CONFIDENCE_JUMP_THRESHOLD
  ) {
    changes.push(
      `Confidence jump → ${prev.playbookConfidence} to ${curr.playbookConfidence}`
    );
  }

  if (!changes.length) {
    return "State update";
  }

  return changes.join("; ");
}

export function updateTimeline(args: UpdateTimelineArgs): void {
  const now = args.now;
  const isoTime = new Date(now).toISOString();

  const entry: StateTimelineEntry = {
    timestamp: now,
    isoTime,
    spot: args.spot,
    optionsGammaRegime: args.optionsGammaRegime ?? null,
    optionsRegimeQuality: args.optionsRegimeQuality ?? null,
    optionsMagnetBias: args.optionsMagnetBias ?? null,
    marketGammaRegime: args.marketGammaRegime ?? null,
    absorptionStatus: args.absorptionStatus ?? null,
    absorptionSide: args.absorptionSide ?? null,
    pressureState: args.pressureState ?? null,
    defenseHealth:
      typeof args.defenseHealth === "number" && Number.isFinite(args.defenseHealth)
        ? args.defenseHealth
        : null,
    resolutionState: args.resolutionState ?? null,
    playbookState: args.playbookState ?? null,
    playbookBias: args.playbookBias ?? null,
    playbookConfidence:
      typeof args.playbookConfidence === "number" &&
      Number.isFinite(args.playbookConfidence)
        ? args.playbookConfidence
        : null,
    transitionLabel: "",
  };

  if (!lastEntry) {
    entry.transitionLabel = buildTransitionLabel(null, entry);
    timeline.push(entry);
    lastEntry = entry;
  } else {
    const sameCoreState =
      lastEntry.playbookState === entry.playbookState &&
      lastEntry.playbookBias === entry.playbookBias &&
      lastEntry.resolutionState === entry.resolutionState &&
      lastEntry.pressureState === entry.pressureState &&
      lastEntry.optionsGammaRegime === entry.optionsGammaRegime &&
      lastEntry.optionsRegimeQuality === entry.optionsRegimeQuality &&
      lastEntry.absorptionStatus === entry.absorptionStatus &&
      lastEntry.absorptionSide === entry.absorptionSide;

    const confidenceChange =
      lastEntry.playbookConfidence != null && entry.playbookConfidence != null
        ? Math.abs(entry.playbookConfidence - lastEntry.playbookConfidence)
        : 0;

    const withinDebounce = now - lastEntry.timestamp < DEBOUNCE_MS;

    if (sameCoreState && confidenceChange < CONFIDENCE_JUMP_THRESHOLD && withinDebounce) {
      return;
    }

    entry.transitionLabel = buildTransitionLabel(lastEntry, entry);
    timeline.push(entry);
    lastEntry = entry;
  }

  while (timeline.length > MAX_ENTRIES) {
    timeline.shift();
  }
}

export function getTimeline(): StateTimelineEntry[] {
  // Newest-first for convenience
  return [...timeline].sort((a, b) => b.timestamp - a.timestamp);
}

export function getTimelineSummary() {
  if (!timeline.length) {
    return {
      entries: 0,
      lastTransitionAt: null as number | null,
      lastTransitionLabel: null as string | null,
    };
  }
  const last = timeline[timeline.length - 1];
  return {
    entries: timeline.length,
    lastTransitionAt: last.timestamp,
    lastTransitionLabel: last.transitionLabel,
  };
}

