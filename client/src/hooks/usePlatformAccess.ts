import { useCallback, useMemo, useSyncExternalStore } from "react";
import { useTerminalAuth } from "@/contexts/TerminalAuthContext";
import {
  getTerminalRedirect,
  readMockAccessMode,
  resolvePlatformUser,
  setMockAccessMode,
  type MockAccessMode,
  type PlatformUser,
} from "@/lib/platformAccess";

function subscribeMockAccess(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener("gt-mock-access-change", callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener("gt-mock-access-change", callback);
  };
}

function getMockAccessSnapshot(): MockAccessMode {
  return readMockAccessMode();
}

/**
 * Bridges TerminalAuthContext with marketing / access helpers.
 * Mock modes (localStorage) override auth for landing UI testing only —
 * `/terminal` still uses real BlockedAccessScreen gates.
 */
export function usePlatformAccess(): PlatformUser & {
  authReady: boolean;
  terminalRedirect: string;
  mockAccessMode: MockAccessMode;
  setMockAccessMode: (mode: MockAccessMode) => void;
} {
  const { authReady, authenticated, access } = useTerminalAuth();
  const mockAccessMode = useSyncExternalStore(
    subscribeMockAccess,
    getMockAccessSnapshot,
    () => "off" as MockAccessMode,
  );

  const user = useMemo<PlatformUser>(
    () =>
      resolvePlatformUser(
        { authenticated, accessAllowed: access?.allowed === true },
        mockAccessMode,
      ),
    [authenticated, access?.allowed, mockAccessMode],
  );

  const updateMockMode = useCallback((mode: MockAccessMode) => {
    setMockAccessMode(mode);
    window.dispatchEvent(new Event("gt-mock-access-change"));
  }, []);

  return {
    authReady,
    mockAccessMode,
    setMockAccessMode: updateMockMode,
    ...user,
    terminalRedirect: getTerminalRedirect(user),
  };
}
