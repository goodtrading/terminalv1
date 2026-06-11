import {
  createContext,
  useCallback,
  useContext,
  useEffect,
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
import { isDesktopBuild } from "@/lib/desktopStorage";

type DesktopUpdateContextValue = {
  update: DesktopUpdateState;
  dismissedOptional: boolean;
  shouldShowOptionalModal: boolean;
  checkNow: () => Promise<void>;
  dismissOptional: () => void;
  showOptionalModal: () => void;
  downloadUpdate: () => Promise<void>;
  downloadError: string | null;
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
    if (!isDesktopBuild || checkingRef.current) return;

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

  useEffect(() => {
    if (!isDesktopBuild) return;

    void checkNow();

    const retryTimer = window.setTimeout(() => {
      void checkNow();
    }, 5_000);

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void checkNow();
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.clearTimeout(retryTimer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [checkNow]);

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
    try {
      await openDesktopUpdateDownload(update.downloadUrl);
    } catch (error) {
      setDownloadError(error instanceof Error ? error.message : String(error));
    }
  }, [update.downloadUrl]);

  const value = useMemo(
    () => ({
      update,
      dismissedOptional,
      shouldShowOptionalModal,
      checkNow,
      dismissOptional,
      showOptionalModal,
      downloadUpdate,
      downloadError,
    }),
    [
      checkNow,
      dismissOptional,
      dismissedOptional,
      downloadError,
      downloadUpdate,
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
      checkNow: async () => {},
      dismissOptional: () => {},
      showOptionalModal: () => {},
      downloadUpdate: async () => {},
      downloadError: null,
    };
  }
  return ctx;
}
