import { apiRequest } from "@/lib/queryClient";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useTerminalAuth } from "./TerminalAuthContext";

export type GoodTradingAccountContextStatus = "idle" | "loading" | "ready" | "error";

export type GoodTradingAccountContextState = Readonly<{
  accountUid: string | null;
  status: GoodTradingAccountContextStatus;
  ownerUserId: number | null;
  generation: number;
  error: Error | null;
}>;

export async function bootstrapGoodTradingAccountContext(): Promise<string> {
  const response = await apiRequest("/api/account-context/bootstrap", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
    assertOk: false,
  });
  const payload = await response.json().catch(() => null) as unknown;
  if (!response.ok) throw new Error(`account-context:${response.status}`);
  if (
    typeof payload !== "object" ||
    payload === null ||
    typeof (payload as { accountUid?: unknown }).accountUid !== "string" ||
    (payload as { accountUid: string }).accountUid.trim().length === 0
  ) {
    throw new Error("ACCOUNT_CONTEXT_MALFORMED");
  }
  return (payload as { accountUid: string }).accountUid;
}

export function createGoodTradingAccountContextCoordinator(
  bootstrap: () => Promise<string>,
) {
  let generation = 0;
  let state: GoodTradingAccountContextState = {
    accountUid: null,
    status: "idle",
    ownerUserId: null,
    generation,
    error: null,
  };

  return {
    getState: () => state,
    bind(userId: number): Promise<void> {
      generation += 1;
      const bindGeneration = generation;
      state = { accountUid: null, status: "loading", ownerUserId: userId, generation: bindGeneration, error: null };
      return bootstrap().then((accountUid) => {
        if (generation !== bindGeneration || state.ownerUserId !== userId) return;
        state = { accountUid, status: "ready", ownerUserId: userId, generation: bindGeneration, error: null };
      }).catch((error: unknown) => {
        if (generation !== bindGeneration || state.ownerUserId !== userId) return;
        state = { accountUid: null, status: "error", ownerUserId: userId, generation: bindGeneration, error: error instanceof Error ? error : new Error(String(error)) };
      });
    },
    invalidate(): void {
      generation += 1;
      state = { accountUid: null, status: "idle", ownerUserId: null, generation, error: null };
    },
  };
}

const GoodTradingAccountContext = createContext<GoodTradingAccountContextState | null>(null);

export function GoodTradingAccountProvider({ children }: { children: ReactNode }) {
  const { authReady, authenticated, user } = useTerminalAuth();
  const coordinatorRef = useRef<ReturnType<typeof createGoodTradingAccountContextCoordinator> | null>(null);
  if (!coordinatorRef.current) {
    coordinatorRef.current = createGoodTradingAccountContextCoordinator(bootstrapGoodTradingAccountContext);
  }
  const coordinator = coordinatorRef.current;
  const [state, setState] = useState<GoodTradingAccountContextState>(() => coordinator.getState());
  const ownerKey = authenticated && user?.id ? String(user.id) : "unauthenticated";

  useEffect(() => {
    if (!authReady || !authenticated || !user?.id) {
      coordinator.invalidate();
      setState(coordinator.getState());
      return;
    }
    setState(coordinator.getState());
    void coordinator.bind(user.id).then(() => setState(coordinator.getState()));
  }, [authReady, authenticated, user?.id, ownerKey, coordinator]);

  const value = useMemo(() => state, [state]);
  return <GoodTradingAccountContext.Provider value={value}>{children}</GoodTradingAccountContext.Provider>;
}

export function useGoodTradingAccountContext(): GoodTradingAccountContextState {
  const context = useContext(GoodTradingAccountContext);
  if (!context) throw new Error("useGoodTradingAccountContext must be used within GoodTradingAccountProvider");
  return context;
}
