import { useCallback, useEffect, useState } from "react";
import { HEATMAP_MIN_VISIBLE_BTC } from "./liquidityHeatmapUtils";
import {
  DEFAULT_LOCAL_RANGE_USD,
  DEFAULT_RIGHT_SPACE_PCT,
  LOCAL_RANGE_USD_OPTIONS,
  RIGHT_SPACE_PCT_OPTIONS,
  type BookmapViewMode,
  type LocalRangeUsd,
  type RightSpacePct,
} from "./bookmapViewMode";
import {
  DEFAULT_DEPTH_RANGE_PRESET,
  DEPTH_RANGE_PRESETS,
  type DepthRangePreset,
} from "@/lib/bookmapDepthRange";
import {
  clampDomWidth,
  DOM_DEFAULT_WIDTH_PX,
  DOM_MAX_WIDTH_PX,
  DOM_MIN_WIDTH_PX,
} from "./bookmapLayoutConstants";
import {
  DEFAULT_BOOKMAP_CONFLUENCE_PREFS,
  parseConfluenceVisualOpacity,
  type BookmapConfluencePrefs,
  type ConfluenceMinDisplayTier,
  type ConfluenceSensitivity,
} from "./bookmapConfluenceConfig";

const STORAGE_KEY = "gt-bookmap-prefs";

export type BookmapPanelPrefs = {
  domWidth: number;
  volumeHeight: number;
  minVisibleBtc: number;
  /** When true, ladder center tracks spot; wheel/pan turn this off. */
  ladderAutoCenter: boolean;
  majorWallsOnly: boolean;
  showTrades: boolean;
  /** Reinforce limit walls that persist across snapshots. */
  showPersistentWalls: boolean;
  /** Far-wall markers; in local mode does not expand range. */
  showImportantFarLevels: boolean;
  bookmapViewMode: BookmapViewMode;
  localRangeUsd: LocalRangeUsd;
  depthRangePreset: DepthRangePreset;
  /** Empty time projection right of latest data (% of visible data span). */
  rightSpacePct: RightSpacePct;
  confluence: BookmapConfluencePrefs;
};

const DEFAULTS: BookmapPanelPrefs = {
  domWidth: DOM_DEFAULT_WIDTH_PX,
  volumeHeight: 90,
  minVisibleBtc: HEATMAP_MIN_VISIBLE_BTC,
  ladderAutoCenter: true,
  majorWallsOnly: false,
  showTrades: true,
  showPersistentWalls: true,
  showImportantFarLevels: true,
  bookmapViewMode: "local",
  localRangeUsd: DEFAULT_LOCAL_RANGE_USD,
  depthRangePreset: DEFAULT_DEPTH_RANGE_PRESET,
  rightSpacePct: DEFAULT_RIGHT_SPACE_PCT,
  confluence: { ...DEFAULT_BOOKMAP_CONFLUENCE_PREFS },
};

function parseConfluencePrefs(raw: unknown): BookmapConfluencePrefs {
  const o = raw && typeof raw === "object" ? (raw as Partial<BookmapConfluencePrefs>) : {};
  const minTier: ConfluenceMinDisplayTier =
    o.minDisplayTier === "medium" || o.minDisplayTier === "major"
      ? o.minDisplayTier
      : o.minDisplayTier === "strong"
        ? "strong"
        : DEFAULT_BOOKMAP_CONFLUENCE_PREFS.minDisplayTier;
  const sensitivity: ConfluenceSensitivity =
    o.sensitivity === "low" || o.sensitivity === "high" ? o.sensitivity : "normal";
  return {
    passiveConfluenceEnabled: o.passiveConfluenceEnabled !== false,
    minDisplayTier: minTier,
    sensitivity,
    showConfluenceLabels: o.showConfluenceLabels !== false,
    visualOpacity: parseConfluenceVisualOpacity(o.visualOpacity),
  };
}

function loadPrefs(): BookmapPanelPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<BookmapPanelPrefs>;
    return {
      domWidth: clampDomWidth(parsed.domWidth ?? DEFAULTS.domWidth),
      volumeHeight: clamp(parsed.volumeHeight ?? DEFAULTS.volumeHeight, 50, 180),
      minVisibleBtc: parsed.minVisibleBtc ?? DEFAULTS.minVisibleBtc,
      ladderAutoCenter: parsed.ladderAutoCenter !== false,
      majorWallsOnly: Boolean(parsed.majorWallsOnly),
      showTrades: parsed.showTrades !== false,
      showPersistentWalls: parsed.showPersistentWalls !== false,
      showImportantFarLevels: parsed.showImportantFarLevels !== false,
      bookmapViewMode:
        parsed.bookmapViewMode === "fullDepth" ||
        (parsed as { showFullDepth?: boolean }).showFullDepth
          ? "fullDepth"
          : "local",
      depthRangePreset: DEPTH_RANGE_PRESETS.includes(
        parsed.depthRangePreset as DepthRangePreset,
      )
        ? (parsed.depthRangePreset as DepthRangePreset)
        : parsed.bookmapViewMode === "fullDepth" ||
            (parsed as { showFullDepth?: boolean }).showFullDepth
          ? "fullDepth"
          : DEFAULT_DEPTH_RANGE_PRESET,
      localRangeUsd: LOCAL_RANGE_USD_OPTIONS.includes(
        parsed.localRangeUsd as LocalRangeUsd,
      )
        ? (parsed.localRangeUsd as LocalRangeUsd)
        : DEFAULT_LOCAL_RANGE_USD,
      rightSpacePct: RIGHT_SPACE_PCT_OPTIONS.includes(
        parsed.rightSpacePct as RightSpacePct,
      )
        ? (parsed.rightSpacePct as RightSpacePct)
        : DEFAULT_RIGHT_SPACE_PCT,
      confluence: parseConfluencePrefs(parsed.confluence),
    };
  } catch {
    return { ...DEFAULTS };
  }
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

export function useBookmapPanelPrefs() {
  const [prefs, setPrefs] = useState<BookmapPanelPrefs>(loadPrefs);

  const updatePrefs = useCallback((patch: Partial<BookmapPanelPrefs>) => {
    setPrefs((prev) => {
      const next = {
        ...prev,
        ...patch,
        confluence: patch.confluence
          ? { ...prev.confluence, ...patch.confluence }
          : prev.confluence,
      };
      if (patch.domWidth != null) {
        next.domWidth = clampDomWidth(patch.domWidth);
      }
      if (patch.volumeHeight != null) {
        next.volumeHeight = clamp(patch.volumeHeight, 50, 180);
      }
      return next;
    });
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    } catch {
      /* ignore */
    }
  }, [prefs]);

  return { prefs, updatePrefs };
}

export { DOM_MIN_WIDTH_PX, DOM_MAX_WIDTH_PX, DOM_DEFAULT_WIDTH_PX };
