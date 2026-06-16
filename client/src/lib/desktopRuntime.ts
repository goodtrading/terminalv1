/** Compile-time desktop bundle flag (Vite). */
export function isDesktopBuildFlag(): boolean {
  return import.meta.env.VITE_PLATFORM === "desktop";
}

/** Runtime Tauri shell (works even if VITE_PLATFORM was missing at build). */
export function isTauriRuntime(): boolean {
  if (typeof window === "undefined") return false;
  return "__TAURI_INTERNALS__" in window || "__TAURI__" in window;
}

/** True for packaged Tauri app or desktop web build. */
export function isDesktopApp(): boolean {
  return isDesktopBuildFlag() || isTauriRuntime();
}
