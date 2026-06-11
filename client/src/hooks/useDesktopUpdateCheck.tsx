import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  checkDesktopUpdate,
  defaultDesktopUpdateState,
  openDesktopUpdateDownload,
  type DesktopUpdateState,
} from "@/lib/desktopUpdateCheck";
import {
  clearDismissedOptionalVersion,
  isOptionalUpdateDismissed,
  readDismissedOptionalVersion,
  writeDismissedOptionalVersion,
} from "@/lib/desktopUpdateDismiss";
import { isDesktopApp } from "@/lib/desktopRuntime";
import { writeDesktopLog } from "@/lib/desktopStorage";
import { appVersion } from "@/lib/appVersion";

export type ManualCheckFeedback =
  | "idle"
  | "checking"
  | "up_to_date"
  | "update_available"
  | "error";

type DesktopUpdateContextValue = {
  update: DesktopUpdateState;
  dismissedOptional: boolean;
  shouldShowOptionalModal: boolean;
  manualCheckFeedback: ManualCheckFeedback;
  checkNow: () => Promise<void>;
  checkManually: () => Promise<void>;
  dismissOptional: () => void;
  showOptionalModal: () => void;
  downloadUpdate: () => Promise<void>;
  downloadError: string | null;
  downloadOpening: boolean;
};

const DesktopUpdateContext = createContext<DesktopUpdateContextValue | null>(null);

function syncDismissedForLatest(
  update: DesktopUpdateState,
  dismissedVersion: string | null,
): boolean {
  if (update.updateStatus !== "optional_update") return false;
  return isOptionalUpdateDismissed(update.latestVersion, dismissedVersion);
}

export function DesktopUpdateProvider({ children }: { children: ReactNode }) {
  const [update, setUpdate] = useState<DesktopUpdateState>(defaultDesktopUpdateState);
  const [dismissedVersion, setDismissedVersion] = useState<string | null>(() =>
    readDismissedOptionalVersion(),
  );
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [downloadOpening, setDownloadOpening] = useState(false);
  const [manualCheckFeedback, setManualCheckFeedback] = useState<ManualCheckFeedback>("idle");
  const checkingRef = useRef(false);

  const dismissedOptional = syncDismissedForLatest(update, dismissedVersion);
  const shouldShowOptionalModal =
    update.updateStatus === "optional_update" && !dismissedOptional;

  const applyUpdateResult = useCallback((next: DesktopUpdateState) => {
    setUpdate(next);
    if (next.updateStatus !== "optional_update") return;

    const storedDismissed = readDismissedOptionalVersion();
    if (!isOptionalUpdateDismissed(next.latestVersion, storedDismissed)) {
      if (storedDismissed && storedDismissed !== next.latestVersion?.trim()) {
        clearDismissedOptionalVersion();
      }
      setDismissedVersion(null);
      return;
    }

    setDismissedVersion(storedDismissed);
  }, []);

  const checkNow = useCallback(async () => {
    if (!isDesktopApp() || checkingRef.current) return;

    checkingRef.current = true;
    setUpdate((current) => ({
      ...current,
      updateStatus: "checking",
      lastUpdateError: null,
    }));

    try {
      const next = await checkDesktopUpdate();
      applyUpdateResult(next);
    } finally {
      checkingRef.current = false;
    }
  }, [applyUpdateResult]);

  const checkManually = useCallback(async () => {
    if (!isDesktopApp() || checkingRef.current) return;

    await writeDesktopLog("desktop_update_manual_check_click", {
      currentVersion: appVersion,
    });

    checkingRef.current = true;
    setManualCheckFeedback("checking");
    setUpdate((current) => ({
      ...current,
      updateStatus: "checking",
      lastUpdateError: null,
    }));

    try {
      const next = await checkDesktopUpdate();
      applyUpdateResult(next);

      if (next.updateStatus === "error") {
        await writeDesktopLog("desktop_update_manual_check_error", {
          currentVersion: appVersion,
          error: next.lastUpdateError ?? "unknown",
        });
        setManualCheckFeedback("error");
        return;
      }

      await writeDesktopLog("desktop_update_manual_check_success", {
        currentVersion: appVersion,
        latestVersion: next.latestVersion,
        updateStatus: next.updateStatus,
      });

      if (
        next.updateStatus === "optional_update" ||
        next.updateStatus === "required_update"
      ) {
        setManualCheckFeedback("update_available");
        if (next.updateStatus === "optional_update") {
          clearDismissedOptionalVersion();
          setDismissedVersion(null);
        }
        return;
      }

      setManualCheckFeedback("up_to_date");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await writeDesktopLog("desktop_update_manual_check_error", {
        currentVersion: appVersion,
        error: message,
      });
      setManualCheckFeedback("error");
    } finally {
      checkingRef.current = false;
    }
  }, [applyUpdateResult]);

  const dismissOptional = useCallback(() => {
    const latestVersion = update.latestVersion?.trim();
    if (!latestVersion) return;
    writeDismissedOptionalVersion(latestVersion);
    setDismissedVersion(latestVersion);
    setDownloadError(null);
  }, [update.latestVersion]);

  const showOptionalModal = useCallback(() => {
    clearDismissedOptionalVersion();
    setDismissedVersion(null);
    setDownloadError(null);
  }, []);

  const downloadUpdate = useCallback(async () => {
    setDownloadError(null);
    setDownloadOpening(true);
    try {
      await openDesktopUpdateDownload(update.downloadUrl, {
        latestVersion: update.latestVersion,
      });
    } catch (error) {
      setDownloadError(error instanceof Error ? error.message : String(error));
    } finally {
      setDownloadOpening(false);
    }
  }, [update.downloadUrl, update.latestVersion]);

  const value = useMemo(
    () => ({
      update,
      dismissedOptional,
      shouldShowOptionalModal,
      manualCheckFeedback,
      checkNow,
      checkManually,
      dismissOptional,
      showOptionalModal,
      downloadUpdate,
      downloadError,
      downloadOpening,
    }),
    [
      checkManually,
      checkNow,
      dismissOptional,
      dismissedOptional,
      downloadError,
      downloadOpening,
      downloadUpdate,
      manualCheckFeedback,
      shouldShowOptionalModal,
      showOptionalModal,
      update,
    ],
  );

  return <DesktopUpdateContext.Provider value={value}>{children}</DesktopUpdateContext.Provider>;
}

export function useDesktopUpdateCheck(): DesktopUpdateContextValue {
  const ctx = useContext(DesktopUpdateContext);
  if (!ctx) {
    return {
      update: defaultDesktopUpdateState,
      dismissedOptional: false,
      shouldShowOptionalModal: false,
      manualCheckFeedback: "idle" as ManualCheckFeedback,
      checkNow: async () => {},
      checkManually: async () => {},
      dismissOptional: () => {},
      showOptionalModal: () => {},
      downloadUpdate: async () => {},
      downloadError: null,
      downloadOpening: false,
    };
  }
  return ctx;
}
