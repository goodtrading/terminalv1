/**
 * Chart overlay: operational flip = local ?? broad; global/structural = options.gammaFlipGlobal (API), never legacy client-side.
 */

export type GammaOverlayOptionsInput = {
  gammaFlip?: number | null;
  gammaFlipGlobal?: number | null;
  gammaFlipBroad?: number | null;
  gammaFlipLocal?: number | null;
  localTransitionZoneStart?: number | null;
  localTransitionZoneEnd?: number | null;
  gammaFlipOperationalLegacy?: number | null;
} | null | undefined;

export type GammaOverlayMarketInput = {
  gammaFlip?: number | null;
  transitionZoneStart?: number | null;
  transitionZoneEnd?: number | null;
} | null | undefined;

export type GammaOverlaySelection = {
  globalFlip: number | null;
  broadFlip: number | null;
  localFlip: number | null;
  localZoneStart: number | null;
  localZoneEnd: number | null;
  broadZoneStart: number | null;
  broadZoneEnd: number | null;
  /** Intradía: local si existe, si no broad táctico. */
  selectedFlipForChart: number | null;
  selectedFlipType: "local" | "broad" | null;
};

function finitePositive(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null;
}

export function resolveGammaOverlaySelection(
  market: GammaOverlayMarketInput,
  options: GammaOverlayOptionsInput,
): GammaOverlaySelection {
  const globalFlip = finitePositive(options?.gammaFlipGlobal);

  const broadFlip =
    finitePositive(options?.gammaFlipBroad) ??
    finitePositive(market?.gammaFlip) ??
    finitePositive(options?.gammaFlip);

  const localFlip = finitePositive(options?.gammaFlipLocal);

  const localZoneStart = finitePositive(options?.localTransitionZoneStart);
  const localZoneEnd = finitePositive(options?.localTransitionZoneEnd);

  const broadZoneStart = finitePositive(market?.transitionZoneStart);
  const broadZoneEnd = finitePositive(market?.transitionZoneEnd);

  if (localFlip != null) {
    return {
      globalFlip,
      broadFlip,
      localFlip,
      localZoneStart,
      localZoneEnd,
      broadZoneStart,
      broadZoneEnd,
      selectedFlipForChart: localFlip,
      selectedFlipType: "local",
    };
  }

  if (broadFlip != null) {
    return {
      globalFlip,
      broadFlip,
      localFlip: null,
      localZoneStart: null,
      localZoneEnd: null,
      broadZoneStart,
      broadZoneEnd,
      selectedFlipForChart: broadFlip,
      selectedFlipType: "broad",
    };
  }

  return {
    globalFlip,
    broadFlip: null,
    localFlip: null,
    localZoneStart: null,
    localZoneEnd: null,
    broadZoneStart,
    broadZoneEnd,
    selectedFlipForChart: null,
    selectedFlipType: null,
  };
}
