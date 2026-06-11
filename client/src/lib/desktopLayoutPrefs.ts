const PANELS_VISIBLE_KEY = "goodtrading.desktop:desktopPanelsVisible";

export function readDesktopPanelsVisible(): boolean {
  try {
    const raw = localStorage.getItem(PANELS_VISIBLE_KEY);
    if (raw === "false") return false;
    return true;
  } catch {
    return true;
  }
}

export function writeDesktopPanelsVisible(visible: boolean): void {
  try {
    localStorage.setItem(PANELS_VISIBLE_KEY, String(visible));
  } catch {
    // ignore storage access errors
  }
}
