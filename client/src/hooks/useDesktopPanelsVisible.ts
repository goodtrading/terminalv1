import { useCallback, useState } from "react";
import { writeDesktopLog } from "@/lib/desktopStorage";
import {
  readDesktopPanelsVisible,
  writeDesktopPanelsVisible,
} from "@/lib/desktopLayoutPrefs";

export type TerminalViewMode = "trading" | "analysis" | "execution" | "focus";

export function useDesktopPanelsVisible() {
  const [viewMode, setViewModeState] = useState<TerminalViewMode>(() =>
    readDesktopPanelsVisible() ? "trading" : "focus",
  );

  const setViewMode = useCallback((mode: TerminalViewMode) => {
    setViewModeState(mode);
    writeDesktopPanelsVisible(mode !== "focus");
    void writeDesktopLog("desktop_layout_view_mode_changed", { mode });
    window.dispatchEvent(new Event("resize"));
  }, []);

  const togglePanels = useCallback(() => {
    setViewMode(viewMode === "focus" ? "trading" : "focus");
  }, [setViewMode, viewMode]);

  return {
    viewMode,
    setViewMode,
    panelsVisible: viewMode !== "focus",
    togglePanels,
    setPanelsVisible: (visible: boolean) => setViewMode(visible ? "trading" : "focus"),
  };
}
