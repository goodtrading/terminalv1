import type { AuthUser } from "@/contexts/TerminalAuthContext";
import type { DrawingTool } from "@/components/terminal/drawings/types";

export const VISIBLE_FILL_OPACITY = 0.22;

export type PositionStyleSettings = {
  targetFillColor: string;
  targetLineColor: string;
  targetOpacity: number;
  stopFillColor: string;
  stopLineColor: string;
  stopOpacity: number;
  entryLineColor: string;
  labelTextColor?: string;
  showLabels: boolean;
  labelPrecision: number;
};

export type DrawingUserSettingsV2 = {
  version: 2;
  updatedAt: number;
  longPosition: PositionStyleSettings;
  shortPosition: PositionStyleSettings;
  toolStyles?: Partial<
    Record<
      DrawingTool,
      {
        color: string;
        lineWidth: number;
        opacity: number;
      }
    >
  >;
  toolbar?: {
    x?: number;
    y?: number;
    collapsed?: boolean;
  };
};

export const DEFAULT_LONG_POSITION_STYLE: PositionStyleSettings = {
  targetFillColor: "#16a34a",
  targetLineColor: "#22c55e",
  targetOpacity: VISIBLE_FILL_OPACITY,
  stopFillColor: "#991b1b",
  stopLineColor: "#ef4444",
  stopOpacity: VISIBLE_FILL_OPACITY,
  entryLineColor: "#e5e7eb",
  showLabels: true,
  labelPrecision: 2,
};

export const DEFAULT_SHORT_POSITION_STYLE: PositionStyleSettings = {
  targetFillColor: "#16a34a",
  targetLineColor: "#22c55e",
  targetOpacity: VISIBLE_FILL_OPACITY,
  stopFillColor: "#991b1b",
  stopLineColor: "#ef4444",
  stopOpacity: VISIBLE_FILL_OPACITY,
  entryLineColor: "#e5e7eb",
  showLabels: true,
  labelPrecision: 2,
};

export const DEFAULT_DRAWING_SETTINGS_V2: DrawingUserSettingsV2 = {
  version: 2,
  updatedAt: 0,
  longPosition: { ...DEFAULT_LONG_POSITION_STYLE },
  shortPosition: { ...DEFAULT_SHORT_POSITION_STYLE },
};

const SETTINGS_V2_PREFIX = "goodtrading:drawing-settings:v2:";
const SETTINGS_V1_PREFIX = "goodtrading:drawing-settings:v1:";

const HEX6 = /^#([0-9a-fA-F]{6})$/;

function settingsKeyV2(userScope: string): string {
  return `${SETTINGS_V2_PREFIX}${userScope}`;
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

export function normalizeHexColor(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  if (HEX6.test(trimmed)) return trimmed.toLowerCase();
  if (trimmed.startsWith("#") && trimmed.length === 9) {
    const six = `#${trimmed.slice(1, 7)}`;
    if (HEX6.test(six)) return six.toLowerCase();
  }
  return fallback;
}

export function normalizeOpacity(value: unknown, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  if (n > 1 && n <= 100) return clamp01(n / 100);
  return clamp01(n);
}

/** Convert legacy high multiplier values (e.g. 0.9) to visible fill alpha. */
export function normalizeFillOpacity(value: unknown, fallback = VISIBLE_FILL_OPACITY): number {
  const n = normalizeOpacity(value, fallback);
  if (n > 0.75) return clamp01(n * VISIBLE_FILL_OPACITY);
  if (n <= 0 && value !== 0) return fallback;
  return n;
}

export function hexToRgba(hex: string, opacity: number): string {
  const normalized = normalizeHexColor(hex, "#22c55e");
  const alpha = normalizeOpacity(opacity, VISIBLE_FILL_OPACITY);
  const raw = normalized.slice(1);
  const r = parseInt(raw.slice(0, 2), 16);
  const g = parseInt(raw.slice(2, 4), 16);
  const b = parseInt(raw.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function normalizePositionStyle(
  defaults: PositionStyleSettings,
  parsed?: Partial<PositionStyleSettings> | null,
): PositionStyleSettings {
  const p = parsed ?? {};
  return {
    targetFillColor: normalizeHexColor(p.targetFillColor, defaults.targetFillColor),
    targetLineColor: normalizeHexColor(p.targetLineColor, defaults.targetLineColor),
    targetOpacity: normalizeFillOpacity(p.targetOpacity, defaults.targetOpacity),
    stopFillColor: normalizeHexColor(p.stopFillColor, defaults.stopFillColor),
    stopLineColor: normalizeHexColor(p.stopLineColor, defaults.stopLineColor),
    stopOpacity: normalizeFillOpacity(p.stopOpacity, defaults.stopOpacity),
    entryLineColor: normalizeHexColor(p.entryLineColor, defaults.entryLineColor),
    labelTextColor:
      typeof p.labelTextColor === "string" ? p.labelTextColor : defaults.labelTextColor,
    showLabels: typeof p.showLabels === "boolean" ? p.showLabels : defaults.showLabels,
    labelPrecision:
      typeof p.labelPrecision === "number" && Number.isFinite(p.labelPrecision)
        ? Math.max(0, Math.floor(p.labelPrecision))
        : defaults.labelPrecision,
  };
}

export function mergeDrawingSettingsWithDefaults(
  parsed: Partial<DrawingUserSettingsV2> | null | undefined,
): DrawingUserSettingsV2 {
  const base = DEFAULT_DRAWING_SETTINGS_V2;
  if (!parsed) return { ...base, updatedAt: Date.now() };
  const merged: DrawingUserSettingsV2 = {
    ...base,
    ...parsed,
    version: 2,
    updatedAt: typeof parsed.updatedAt === "number" ? parsed.updatedAt : Date.now(),
    longPosition: normalizePositionStyle(base.longPosition, parsed.longPosition),
    shortPosition: normalizePositionStyle(base.shortPosition, parsed.shortPosition),
    toolStyles: parsed.toolStyles,
    toolbar: parsed.toolbar,
  };
  if (import.meta.env.DEV) {
    console.debug("[drawing-color:merged]", {
      targetFillColor: merged.longPosition.targetFillColor,
      targetOpacity: merged.longPosition.targetOpacity,
      stopFillColor: merged.longPosition.stopFillColor,
      stopOpacity: merged.longPosition.stopOpacity,
    });
  }
  return merged;
}

function migrateLegacyLongShort(
  longShort?: {
    targetColor?: string;
    stopColor?: string;
    showLabels?: boolean;
    labelPrecision?: number;
  } | null,
): Pick<DrawingUserSettingsV2, "longPosition" | "shortPosition"> {
  if (!longShort) {
    return {
      longPosition: { ...DEFAULT_LONG_POSITION_STYLE },
      shortPosition: { ...DEFAULT_SHORT_POSITION_STYLE },
    };
  }
  const shared: Partial<PositionStyleSettings> = {
    targetFillColor: longShort.targetColor,
    targetLineColor: longShort.targetColor,
    stopFillColor: longShort.stopColor,
    stopLineColor: longShort.stopColor,
    showLabels: longShort.showLabels,
    labelPrecision: longShort.labelPrecision,
  };
  return {
    longPosition: normalizePositionStyle(DEFAULT_LONG_POSITION_STYLE, shared),
    shortPosition: normalizePositionStyle(DEFAULT_SHORT_POSITION_STYLE, shared),
  };
}

function migrateV1Settings(raw: string): DrawingUserSettingsV2 | null {
  try {
    const parsed = JSON.parse(raw) as {
      version?: number;
      toolStyles?: DrawingUserSettingsV2["toolStyles"];
      longShort?: {
        targetColor?: string;
        stopColor?: string;
        showLabels?: boolean;
        labelPrecision?: number;
      };
      toolbar?: DrawingUserSettingsV2["toolbar"];
    };
    if (!parsed || parsed.version !== 1) return null;
    const migrated = migrateLegacyLongShort(parsed.longShort);
    return mergeDrawingSettingsWithDefaults({
      version: 2,
      updatedAt: Date.now(),
      ...migrated,
      toolStyles: parsed.toolStyles,
      toolbar: parsed.toolbar,
    });
  } catch {
    return null;
  }
}

export function getStableDrawingUserKey(user: AuthUser | null | undefined): string | null {
  if (!user) return null;
  if (user.id != null && Number.isFinite(Number(user.id))) return String(user.id);
  const email = user.email?.trim().toLowerCase();
  return email || null;
}

export function resolveDrawingUserScope(
  userKey: string | null,
  authReady: boolean,
): string | null {
  if (!authReady) return null;
  return userKey ?? "guest";
}

export function positionStyleForTool(
  settings: DrawingUserSettingsV2,
  tool: "longPosition" | "shortPosition",
): PositionStyleSettings {
  return tool === "longPosition" ? settings.longPosition : settings.shortPosition;
}

export function positionStyleToDrawingFields(style: PositionStyleSettings): {
  targetColor: string;
  stopColor: string;
  opacity: number;
  targetOpacity: number;
  stopOpacity: number;
  showLabels: boolean;
  labelPrecision: number;
} {
  const targetOpacity = normalizeFillOpacity(style.targetOpacity, VISIBLE_FILL_OPACITY);
  const stopOpacity = normalizeFillOpacity(style.stopOpacity, VISIBLE_FILL_OPACITY);
  return {
    targetColor: normalizeHexColor(style.targetFillColor, DEFAULT_LONG_POSITION_STYLE.targetFillColor),
    stopColor: normalizeHexColor(style.stopFillColor, DEFAULT_LONG_POSITION_STYLE.stopFillColor),
    opacity: targetOpacity,
    targetOpacity,
    stopOpacity,
    showLabels: style.showLabels,
    labelPrecision: style.labelPrecision,
  };
}

export function drawingFieldsToPositionStyle(
  drawing: {
    targetColor?: string;
    stopColor?: string;
    opacity?: number;
    targetOpacity?: number;
    stopOpacity?: number;
    showLabels?: boolean;
    labelPrecision?: number;
  },
  base: PositionStyleSettings,
): PositionStyleSettings {
  const fillFromDrawing = drawing.targetOpacity ?? drawing.stopOpacity ?? drawing.opacity;
  return normalizePositionStyle(base, {
    targetFillColor: drawing.targetColor,
    targetLineColor: drawing.targetColor,
    stopFillColor: drawing.stopColor,
    stopLineColor: drawing.stopColor,
    targetOpacity: drawing.targetOpacity ?? fillFromDrawing,
    stopOpacity: drawing.stopOpacity ?? fillFromDrawing,
    showLabels: drawing.showLabels,
    labelPrecision: drawing.labelPrecision,
  });
}

export function resolvePositionFillOpacities(drawing: {
  opacity?: number;
  targetOpacity?: number;
  stopOpacity?: number;
}): { targetOpacity: number; stopOpacity: number } {
  const target = normalizeFillOpacity(
    drawing.targetOpacity ?? drawing.opacity,
    VISIBLE_FILL_OPACITY,
  );
  const stop = normalizeFillOpacity(
    drawing.stopOpacity ?? drawing.opacity ?? target,
    VISIBLE_FILL_OPACITY,
  );
  return { targetOpacity: target, stopOpacity: stop };
}

export function logDrawingColorModal(values: {
  targetFillColor?: string;
  stopFillColor?: string;
  targetOpacity?: number;
  stopOpacity?: number;
}): void {
  if (!import.meta.env.DEV) return;
  console.debug("[drawing-color:modal]", values);
}

export function logDrawingColorSave(
  key: string,
  settings: DrawingUserSettingsV2,
): void {
  if (!import.meta.env.DEV) return;
  console.debug("[drawing-color:save]", {
    key,
    targetFillColor: settings.longPosition.targetFillColor,
    targetOpacity: settings.longPosition.targetOpacity,
    stopFillColor: settings.longPosition.stopFillColor,
    stopOpacity: settings.longPosition.stopOpacity,
  });
}

export function logDrawingColorLoad(
  key: string,
  parsed: Partial<DrawingUserSettingsV2> | null,
): void {
  if (!import.meta.env.DEV) return;
  console.debug("[drawing-color:load]", {
    key,
    parsedTargetFillColor: parsed?.longPosition?.targetFillColor,
    parsedTargetOpacity: parsed?.longPosition?.targetOpacity,
    parsedStopFillColor: parsed?.longPosition?.stopFillColor,
    parsedStopOpacity: parsed?.longPosition?.stopOpacity,
  });
}

export function logDrawingColorRender(values: {
  fillColor: string;
  opacity: number;
  resolvedCanvasColor: string;
  zone: "target" | "stop";
}): void {
  if (!import.meta.env.DEV) return;
  console.debug("[drawing-color:render]", values);
}

export function loadDrawingSettingsV2(userScope: string): DrawingUserSettingsV2 {
  const key = settingsKeyV2(userScope);
  try {
    const v2Raw = localStorage.getItem(key);
    if (v2Raw) {
      if (import.meta.env.DEV) {
        console.debug("[drawing-color:raw-storage]", { key, raw: v2Raw });
      }
      const parsed = JSON.parse(v2Raw) as Partial<DrawingUserSettingsV2>;
      logDrawingColorLoad(key, parsed);
      return mergeDrawingSettingsWithDefaults(parsed);
    }

    const v1Key = `${SETTINGS_V1_PREFIX}${userScope}`;
    const v1Raw = localStorage.getItem(v1Key);
    if (v1Raw) {
      const migrated = migrateV1Settings(v1Raw);
      if (migrated) {
        saveDrawingSettingsV2(userScope, migrated);
        return migrated;
      }
    }
  } catch {
    /* fall through */
  }

  return { ...DEFAULT_DRAWING_SETTINGS_V2, updatedAt: Date.now() };
}

export function saveDrawingSettingsV2(userScope: string, settings: DrawingUserSettingsV2): void {
  try {
    const key = settingsKeyV2(userScope);
    const payload: DrawingUserSettingsV2 = mergeDrawingSettingsWithDefaults(settings);
    localStorage.setItem(key, JSON.stringify(payload));
    logDrawingColorSave(key, payload);
  } catch (e) {
    console.warn("[Drawings] Failed to save settings v2:", e);
  }
}

export function getDrawingSettingsStorageKey(userScope: string): string {
  return settingsKeyV2(userScope);
}

/** DEV helper: remove only the v2 settings key for the current user scope. */
export function clearDrawingSettingsV2ForDev(userScope: string): void {
  if (!import.meta.env.DEV) return;
  localStorage.removeItem(settingsKeyV2(userScope));
}
