import { useCallback, useState } from "react";
import { writeDesktopLog } from "@/lib/desktopStorage";
import {
  readDesktopPanelsVisible,
  writeDesktopPanelsVisible,
} from "@/lib/desktopLayoutPrefs";

export function useDesktopPanelsVisible() {
  const [panelsVisible, setPanelsVisible] = useState(() => readDesktopPanelsVisible());

  const togglePanels = useCallback(() => {
    setPanelsVisible((prev) => {
      const next = !prev;
      writeDesktopPanelsVisible(next);
      void writeDesktopLog(
        next ? "desktop_layout_panels_shown" : "desktop_layout_panels_hidden",
      );
      window.dispatchEvent(new Event("resize"));
      return next;
    });
  }, []);

  return { panelsVisible, togglePanels, setPanelsVisible };
}
