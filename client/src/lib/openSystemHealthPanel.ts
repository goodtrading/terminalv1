export const SYSTEM_HEALTH_PANEL_EVENT = "goodtrading:open-system-panel";

export function openSystemHealthPanel(): void {
  window.dispatchEvent(new CustomEvent(SYSTEM_HEALTH_PANEL_EVENT));
}
