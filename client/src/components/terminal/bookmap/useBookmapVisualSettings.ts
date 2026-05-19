import { useCallback, useEffect, useState } from "react";
import {
  DEFAULT_BOOKMAP_VISUAL_SETTINGS,
  loadBookmapVisualSettings,
  mergeBookmapVisualSettings,
  saveBookmapVisualSettings,
  type BookmapVisualSettings,
} from "./bookmapSettings";

export function useBookmapVisualSettings() {
  const [settings, setSettings] = useState<BookmapVisualSettings>(loadBookmapVisualSettings);

  const updateSettings = useCallback(
    (patch: Partial<BookmapVisualSettings> | ((prev: BookmapVisualSettings) => Partial<BookmapVisualSettings>)) => {
      setSettings((prev) => {
        const partial = typeof patch === "function" ? patch(prev) : patch;
        return mergeBookmapVisualSettings(prev, partial);
      });
    },
    [],
  );

  const resetSettings = useCallback(() => {
    setSettings(mergeBookmapVisualSettings(DEFAULT_BOOKMAP_VISUAL_SETTINGS));
  }, []);

  useEffect(() => {
    saveBookmapVisualSettings(settings);
  }, [settings]);

  return {
    settings,
    setSettings,
    updateSettings,
    resetSettings,
    defaults: DEFAULT_BOOKMAP_VISUAL_SETTINGS,
  };
}
