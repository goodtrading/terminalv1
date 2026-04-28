import { useCallback, useState } from "react";

export type TerminalViewMode = "SIMPLE" | "PRO";

const STORAGE_KEY = "gt-terminal-view-mode";

function readStoredMode(): TerminalViewMode {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "PRO" || v === "SIMPLE") return v;
  } catch {
    // ignore
  }
  return "SIMPLE";
}

/**
 * SIMPLE = lectura rápida (default). PRO = UI técnica completa.
 * Persistido en localStorage.
 */
export function useViewMode(): [TerminalViewMode, (m: TerminalViewMode) => void] {
  const [mode, setModeState] = useState<TerminalViewMode>(() => readStoredMode());

  const setMode = useCallback((next: TerminalViewMode) => {
    setModeState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // ignore
    }
  }, []);

  return [mode, setMode];
}
