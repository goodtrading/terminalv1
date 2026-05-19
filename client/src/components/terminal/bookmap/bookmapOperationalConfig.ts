import type { DepthRangePreset } from "@/lib/bookmapDepthRange";
import type { LocalRangeUsd, RightSpacePct } from "@/components/flows/bookmapViewMode";
import type { BookmapMarketSource } from "@shared/bookmapMarket";
import type {
  BookmapSourceMode,
  PerpOverlayOpacityPct,
} from "@shared/bookmapSourceMode";

/** Toolbar + Config operational controls (not visual-style sliders). */
export type BookmapOperationalConfig = {
  sourceMode: BookmapSourceMode;
  onSourceModeChange: (mode: BookmapSourceMode) => void;
  domSource: BookmapMarketSource;
  onDomSourceChange: (market: BookmapMarketSource) => void;
  tradeSource: BookmapMarketSource;
  onTradeSourceChange: (market: BookmapMarketSource) => void;
  perpOverlayOpacityPct: PerpOverlayOpacityPct;
  onPerpOverlayOpacityChange: (pct: PerpOverlayOpacityPct) => void;
  depthRangePreset: DepthRangePreset;
  onDepthPresetChange: (preset: DepthRangePreset) => void;
  localRangeUsd: LocalRangeUsd;
  onLocalRangeUsdChange: (usd: LocalRangeUsd) => void;
  depthPresetLabel: (preset: DepthRangePreset) => string;
  ladderAutoCenter: boolean;
  onLadderAutoCenterChange: (on: boolean) => void;
  followLive: boolean;
  onFollowLiveChange: (on: boolean) => void;
  followLiveDisabled?: boolean;
  rightSpacePct: RightSpacePct;
  onRightSpacePctChange: (pct: RightSpacePct) => void;
  rightSpaceDisabled?: boolean;
  onFitWalls: () => void;
  onFitMajorWalls: () => void;
  onResetSpot: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  minVisibleBtc: number;
  minSizeOptions: readonly number[];
  onMinVisibleBtcChange: (btc: number) => void;
  minSizeDisabled?: boolean;
  majorWallsOnly: boolean;
  onMajorWallsOnlyChange: (on: boolean) => void;
  showImportantFarLevels: boolean;
  onShowImportantFarLevelsChange: (on: boolean) => void;
  majorWallsPresetActive: boolean;
};
