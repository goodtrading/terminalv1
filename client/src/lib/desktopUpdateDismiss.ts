const DISMISSED_VERSION_KEY = "goodtrading.desktop.update.dismissedVersion";

export function readDismissedOptionalVersion(): string | null {
  try {
    const value = localStorage.getItem(DISMISSED_VERSION_KEY)?.trim();
    return value || null;
  } catch {
    return null;
  }
}

export function writeDismissedOptionalVersion(version: string): void {
  try {
    localStorage.setItem(DISMISSED_VERSION_KEY, version.trim());
  } catch {
    // Best-effort only.
  }
}

export function clearDismissedOptionalVersion(): void {
  try {
    localStorage.removeItem(DISMISSED_VERSION_KEY);
  } catch {
    // Best-effort only.
  }
}

export function isOptionalUpdateDismissed(
  latestVersion: string | null | undefined,
  dismissedVersion: string | null,
): boolean {
  const latest = latestVersion?.trim();
  if (!latest) return false;
  return dismissedVersion?.trim() === latest;
}
