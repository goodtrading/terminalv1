import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  checkDesktopUpdate,
  defaultDesktopUpdateState,
  openDesktopUpdateDownload,
  type DesktopUpdateState,
} from "@/lib/desktopUpdateCheck";
import { isDesktopBuild } from "@/lib/desktopStorage";

type DesktopUpdateContextValue = {
  update: DesktopUpdateState;
  dismissedOptional: boolean;
  checkNow: () => Promise<void>;
  dismissOptional: () => void;
  downloadUpdate: () => Promise<void>;
  downloadError: string | null;
};

const DesktopUpdateContext = createContext<DesktopUpdateContextValue | null>(null);

export function DesktopUpdateProvider({ children }: { children: ReactNode }) {
  const [update, setUpdate] = useState<DesktopUpdateState>(defaultDesktopUpdateState);
  const [dismissedOptional, setDismissedOptional] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const checkNow = useCallback(async () => {
    if (!isDesktopBuild) return;
    setUpdate((current) => ({ ...current, updateStatus: "checking", lastUpdateError: null }));
    const next = await checkDesktopUpdate();
    setUpdate(next);
    setDismissedOptional(false);
  }, []);

  useEffect(() => {
    void checkNow();
  }, [checkNow]);

  const dismissOptional = useCallback(() => {
    setDismissedOptional(true);
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
      checkNow,
      dismissOptional,
      downloadUpdate,
      downloadError,
    }),
    [checkNow, dismissOptional, dismissedOptional, downloadError, downloadUpdate, update],
  );

  return <DesktopUpdateContext.Provider value={value}>{children}</DesktopUpdateContext.Provider>;
}

export function useDesktopUpdateCheck(): DesktopUpdateContextValue {
  const ctx = useContext(DesktopUpdateContext);
  if (!ctx) {
    return {
      update: defaultDesktopUpdateState,
      dismissedOptional: false,
      checkNow: async () => {},
      dismissOptional: () => {},
      downloadUpdate: async () => {},
      downloadError: null,
    };
  }
  return ctx;
}
