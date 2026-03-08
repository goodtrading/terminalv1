import { renderGammaLevels } from "./renderers/gammaLevels";
import { renderLiquidityLevels } from "./renderers/liquidityLevels";
import { renderSweepLevels } from "./renderers/sweepLevels";
import { renderCliffLevels } from "./renderers/cliffLevels";
import { renderCascadeLevels } from "./renderers/cascadeLevels";
import { renderSqueezeLevels } from "./renderers/squeezeLevels";
import { OverlayRenderer } from "./types";
import { OverlayType } from "./overlayState";

export const OVERLAY_RENDERERS: Record<OverlayType, OverlayRenderer> = {
  gammaLevels: renderGammaLevels,
  liquidityLevels: renderLiquidityLevels,
  sweepLevels: renderSweepLevels,
  cliffLevels: renderCliffLevels,
  cascadeLevels: renderCascadeLevels,
  squeezeLevels: renderSqueezeLevels,
  heatmap: () => [], // Handled separately by canvas renderer
};
