/** Compile-time desktop bundle flag (Vite). */
export function isDesktopBuildFlag(): boolean {
  return import.meta.env?.VITE_PLATFORM === "desktop";
}

/** Runtime Tauri shell (works even if VITE_PLATFORM was missing at build). */
export function isTauriRuntime(): boolean {
  const runtimeWindow = globalThis.window as Window | undefined;
  if (typeof runtimeWindow === "undefined") return false;
  return "__TAURI_INTERNALS__" in runtimeWindow || "__TAURI__" in runtimeWindow;
}

/** True for packaged Tauri app or desktop web build. */
export function isDesktopApp(): boolean {
  return isDesktopBuildFlag() || isTauriRuntime();
}
