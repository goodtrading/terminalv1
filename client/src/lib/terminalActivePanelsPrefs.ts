export const TERMINAL_ACTIVE_PANELS_STORAGE_KEY = "terminal-activePanels";

export type TerminalActivePanelId =
  | "LEVELS"
  | "GAMMA"
  | "CASCADE"
  | "SQUEEZE"
  | "HEATMAP"
  | "FOOTPRINT";

const VALID_PANEL_IDS = new Set<string>([
  "LEVELS",
  "GAMMA",
  "CASCADE",
  "SQUEEZE",
  "HEATMAP",
  "FOOTPRINT",
]);

export const DEFAULT_TERMINAL_ACTIVE_PANELS: readonly TerminalActivePanelId[] = ["LEVELS"];

function devWarn(message: string, detail?: unknown): void {
  if (import.meta.env.DEV) {
    console.warn(`[terminal-activePanels] ${message}`, detail ?? "");
  }
}

function isValidPanelId(value: unknown): value is TerminalActivePanelId {
  return typeof value === "string" && VALID_PANEL_IDS.has(value);
}

function removeStoredPanels(): void {
  try {
    localStorage.removeItem(TERMINAL_ACTIVE_PANELS_STORAGE_KEY);
  } catch {
    // ignore storage access errors
  }
}

function serializePanels(panels: Iterable<TerminalActivePanelId>): string {
  return JSON.stringify(Array.from(panels));
}

export function readTerminalActivePanels(): Set<TerminalActivePanelId> {
  try {
    const raw = localStorage.getItem(TERMINAL_ACTIVE_PANELS_STORAGE_KEY);
    if (!raw) {
      return new Set(DEFAULT_TERMINAL_ACTIVE_PANELS);
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      devWarn("invalid JSON in storage; resetting to default", err);
      removeStoredPanels();
      return new Set(DEFAULT_TERMINAL_ACTIVE_PANELS);
    }

    if (!Array.isArray(parsed)) {
      devWarn("stored value is not an array; resetting to default", parsed);
      removeStoredPanels();
      return new Set(DEFAULT_TERMINAL_ACTIVE_PANELS);
    }

    const valid = parsed.filter(isValidPanelId);
    if (valid.length === 0 && parsed.length > 0) {
      devWarn("stored panels contained no valid IDs; resetting to default", parsed);
      removeStoredPanels();
      return new Set(DEFAULT_TERMINAL_ACTIVE_PANELS);
    }

    if (valid.length !== parsed.length) {
      devWarn("stored panels contained obsolete IDs; cleaning storage", parsed);
      writeTerminalActivePanels(valid);
    }

    return new Set(valid);
  } catch (err) {
    devWarn("read failed; using default panels", err);
    return new Set(DEFAULT_TERMINAL_ACTIVE_PANELS);
  }
}

export function writeTerminalActivePanels(panels: Iterable<TerminalActivePanelId>): void {
  const next = serializePanels(panels);

  try {
    const current = localStorage.getItem(TERMINAL_ACTIVE_PANELS_STORAGE_KEY);
    if (current === next) return;
    localStorage.setItem(TERMINAL_ACTIVE_PANELS_STORAGE_KEY, next);
  } catch (err) {
    devWarn("setItem failed; panel preference not persisted", err);
  }
}
