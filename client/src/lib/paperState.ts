import { useEffect, useSyncExternalStore } from "react";
import { useTerminalAuth } from "@/contexts/TerminalAuthContext";
import {
  PAPER_EXECUTION_STATE_CHANGED_EVENT,
  paperExecutionPort,
  getPaperExecutionBackend,
  getPaperExecutionPortState,
  type PaperExecutionBackend,
  type PaperExecutionAvailability,
} from "@/lib/paperExecutionPort";
import {
  EXECUTION_WORKSPACE_CHANGED_EVENT,
  getExecutionWorkspace,
  subscribeExecutionWorkspace,
  type ExecutionWorkspace,
} from "@/lib/executionWorkspace";
import { paperApiFetch } from "@/components/terminal/execution/paperApiClient";
import type {
  PaperAccountSnapshot,
  PaperOrderSnapshot,
  PaperPositionSnapshot,
  PaperTradeLedgerSnapshot,
  PaperFillSnapshot,
  PaperTradingSettings,
} from "@/components/terminal/execution/executionTypes";

type PaperStateSource = "legacy" | "nautilus";
type PaperStateAvailability = "AVAILABLE" | "PARTIAL" | "NOT_WIRED" | "UNAVAILABLE";
type PaperResourceAvailability = "AVAILABLE" | "NOT_WIRED" | "UNAVAILABLE";
type PaperStateResources = {
  account: PaperResourceAvailability;
  position: PaperResourceAvailability;
  orders: PaperResourceAvailability;
  trades: PaperResourceAvailability;
  fills: PaperResourceAvailability;
  settings: PaperResourceAvailability;
};

type PaperState = {
  active: boolean;
  backend: PaperExecutionBackend;
  source: PaperStateSource;
  availability: PaperStateAvailability;
  resources: PaperStateResources;
  account?: PaperAccountSnapshot;
  position: PaperPositionSnapshot | null;
  orders: PaperOrderSnapshot[];
  settings?: PaperTradingSettings;
  trades: PaperTradeLedgerSnapshot[];
  fills: PaperFillSnapshot[];
  loading: boolean;
  error: Error | null;
  lastUpdatedAt: number | null;
  refresh: () => Promise<void>;
};

type PaperRuntime = {
  workspace: ExecutionWorkspace;
  backend: PaperExecutionBackend;
  authReady: boolean;
  authenticated: boolean;
};

type PaperFetcher = (path: string, init?: RequestInit) => Promise<Response>;
type PaperNativeReader = Pick<typeof paperExecutionPort, "getAccount" | "getPosition" | "getOrders" | "getFills">;

export type PaperStateDebugSnapshot = {
  timerExists: boolean;
  tickCount: number;
  refreshStartCount: number;
  refreshEndCount: number;
  lastTickAt: number | null;
  lastRefreshStartAt: number | null;
  lastRefreshEndAt: number | null;
  lastRefreshError: string | null;
  workspace: ExecutionWorkspace;
  backend: PaperExecutionBackend;
  portAvailability: PaperExecutionAvailability;
  resources: Pick<PaperStateResources, "account" | "position" | "orders" | "fills">;
  fillsCount: number;
  feesTotal: string | null;
};

const INITIAL_STATE: Omit<PaperState, "refresh"> = {
  active: false,
  backend: "legacy",
  source: "legacy",
  availability: "AVAILABLE",
  resources: {
    account: "AVAILABLE",
    position: "AVAILABLE",
    orders: "AVAILABLE",
    trades: "AVAILABLE",
    fills: "AVAILABLE",
    settings: "AVAILABLE",
  },
  position: null,
  orders: [],
  trades: [],
  fills: [],
  loading: false,
  error: null,
  lastUpdatedAt: null,
};

const INTERVALS = {
  account: 2500,
  position: 2500,
  orders: 2500,
  trades: 8000,
  stops: 12000,
} as const;

export class PaperStateController {
  private state: Omit<PaperState, "refresh"> = { ...INITIAL_STATE };
  private runtime: PaperRuntime = {
    workspace: "bingx",
    backend: "legacy",
    authReady: false,
    authenticated: false,
  };
  private listeners = new Set<() => void>();
  private timers = new Map<string, ReturnType<typeof setInterval>>();
  private fetcher: PaperFetcher;
  private refreshInFlight: Promise<void> | null = null;
  private debug = {
    tickCount: 0,
    refreshStartCount: 0,
    refreshEndCount: 0,
    lastTickAt: null as number | null,
    lastRefreshStartAt: null as number | null,
    lastRefreshEndAt: null as number | null,
    lastRefreshError: null as string | null,
  };
  private snapshot: PaperState;
  private nativeReader: PaperNativeReader;

  constructor(
    fetcher: PaperFetcher = (path, init) => paperApiFetch(path, init),
    nativeReader: PaperNativeReader = paperExecutionPort,
  ) {
    this.fetcher = fetcher;
    this.nativeReader = nativeReader;
    this.snapshot = { ...this.state, refresh: () => this.refresh() };
  }

  getState = (): PaperState => this.snapshot;

  getDebugSnapshot = (): PaperStateDebugSnapshot => ({
    timerExists: this.timers.has("nautilus"),
    tickCount: this.debug.tickCount,
    refreshStartCount: this.debug.refreshStartCount,
    refreshEndCount: this.debug.refreshEndCount,
    lastTickAt: this.debug.lastTickAt,
    lastRefreshStartAt: this.debug.lastRefreshStartAt,
    lastRefreshEndAt: this.debug.lastRefreshEndAt,
    lastRefreshError: this.debug.lastRefreshError,
    workspace: this.runtime.workspace,
    backend: this.runtime.backend,
    portAvailability: getPaperExecutionPortState().availability,
    resources: {
      account: this.state.resources.account,
      position: this.state.resources.position,
      orders: this.state.resources.orders,
      fills: this.state.resources.fills,
    },
    fillsCount: this.state.fills.length,
    feesTotal: this.state.account?.feesTotal ?? null,
  });

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  setRuntime(runtime: PaperRuntime): void {
    const changed =
      this.runtime.workspace !== runtime.workspace ||
      this.runtime.backend !== runtime.backend ||
      this.runtime.authReady !== runtime.authReady ||
      this.runtime.authenticated !== runtime.authenticated;
    this.runtime = runtime;
    if (!changed) {
      if (runtime.workspace === "paper" && runtime.backend === "nautilus") {
        if (runtime.authReady && runtime.authenticated && getPaperExecutionPortState().availability === "AVAILABLE") {
          this.startNautilusTimers();
        } else {
          this.stopTimers();
        }
      }
      return;
    }

    this.stopTimers();
    if (runtime.workspace !== "paper") {
      this.setState({ active: false, loading: false, error: null });
      return;
    }
    if (runtime.backend === "nautilus") {
      const portState = getPaperExecutionPortState();
      this.setState({
        active: true,
        backend: "nautilus",
        source: "nautilus",
        availability: portState.availability === "AVAILABLE" ? "PARTIAL" : "NOT_WIRED",
        loading: false,
        error: null,
        account: undefined,
        position: null,
        orders: [],
        settings: undefined,
        trades: [],
        fills: [],
        resources: {
          account: portState.availability === "AVAILABLE" ? "AVAILABLE" : "UNAVAILABLE",
          position: portState.availability === "AVAILABLE" ? "AVAILABLE" : "UNAVAILABLE",
          orders: portState.availability === "AVAILABLE" ? "AVAILABLE" : "UNAVAILABLE",
          trades: "NOT_WIRED",
          fills: portState.availability === "AVAILABLE" ? "AVAILABLE" : "UNAVAILABLE",
          settings: "NOT_WIRED",
        },
      });
      if (runtime.authReady && runtime.authenticated && portState.availability === "AVAILABLE") {
        this.startNautilusTimers();
      }
      return;
    }
    this.setState({
      active: true,
      backend: "legacy",
      source: "legacy",
      availability: "AVAILABLE",
      resources: {
        account: "AVAILABLE",
        position: "AVAILABLE",
        orders: "AVAILABLE",
        trades: "AVAILABLE",
        fills: "AVAILABLE",
        settings: "AVAILABLE",
      },
    });
    if (runtime.authReady && runtime.authenticated) {
      this.startTimers();
      void this.refresh();
    }
  }

  async refresh(): Promise<void> {
    if (this.runtime.workspace !== "paper") {
      if (import.meta.env?.DEV) console.debug("[PAPERSTATE_REFRESH_SKIPPED]", { reason: "workspace_not_paper" });
      return;
    }
    if (this.runtime.backend === "nautilus") {
      if (!this.runtime.authReady || !this.runtime.authenticated) return;
      if (this.refreshInFlight) {
        if (import.meta.env?.DEV) console.debug("[PAPERSTATE_REFRESH_SKIPPED]", { reason: "in_flight" });
        return this.refreshInFlight;
      }
      if (import.meta.env?.DEV) console.debug("[PAPERSTATE_REFRESH_START]", { backend: this.runtime.backend });
      this.refreshInFlight = this.refreshNautilus().finally(() => {
        this.refreshInFlight = null;
      });
      return this.refreshInFlight;
    }
    if (!this.canReadLegacy()) return;
    if (this.refreshInFlight) return this.refreshInFlight;
    this.refreshInFlight = this.refreshAll().finally(() => {
      this.refreshInFlight = null;
    });
    return this.refreshInFlight;
  }

  dispose(): void {
    this.stopTimers();
    this.listeners.clear();
  }

  private canReadLegacy(): boolean {
    return (
      this.runtime.workspace === "paper" &&
      this.runtime.backend === "legacy" &&
      this.runtime.authReady &&
      this.runtime.authenticated
    );
  }

  private startTimers(): void {
    if (this.timers.size > 0) return;
    this.timers.set("account", setInterval(() => void this.refreshAccount(), INTERVALS.account));
    this.timers.set("position", setInterval(() => void this.refreshPosition(), INTERVALS.position));
    this.timers.set("orders", setInterval(() => void this.refreshOrders(), INTERVALS.orders));
    this.timers.set("trades", setInterval(() => void this.refreshTrades(), INTERVALS.trades));
    this.timers.set("stops", setInterval(() => void this.checkStops(), INTERVALS.stops));
  }

  private startNautilusTimers(): void {
    if (this.timers.has("nautilus")) {
      if (import.meta.env?.DEV) console.debug("[PAPERSTATE_REFRESH_SKIPPED]", { reason: "timers_already_running" });
      return;
    }
    this.stopTimers();
    this.timers.set("nautilus", setInterval(() => {
      this.debug.tickCount += 1;
      this.debug.lastTickAt = Date.now();
      if (import.meta.env?.DEV) console.debug("[PAPERSTATE_TICK]", { backend: this.runtime.backend, active: this.state.active });
      void this.refresh();
    }, INTERVALS.orders));
    void this.refresh();
  }

  private stopTimers(): void {
    this.timers.forEach((timer) => clearInterval(timer));
    this.timers.clear();
  }

  private async refreshAll(): Promise<void> {
    this.setState({ loading: true, error: null });
    const results = await Promise.allSettled([
      this.refreshAccount(),
      this.refreshPosition(),
      this.refreshOrders(),
      this.refreshSettings(),
      this.refreshTrades(),
    ]);
    const failure = results.find((result): result is PromiseRejectedResult => result.status === "rejected");
    this.setState({
      loading: false,
      error: failure ? (failure.reason instanceof Error ? failure.reason : new Error(String(failure.reason))) : null,
      lastUpdatedAt: results.some((result) => result.status === "fulfilled") ? Date.now() : this.state.lastUpdatedAt,
    });
  }

  private async refreshNautilus(): Promise<void> {
    this.debug.refreshStartCount += 1;
    this.debug.lastRefreshStartAt = Date.now();
    this.debug.lastRefreshError = null;
    if (import.meta.env?.DEV) console.debug("[PAPERSTATE_REFRESH_START]", { backend: this.runtime.backend });
    const portState = getPaperExecutionPortState();
    if (portState.availability !== "AVAILABLE") {
      const notWired = portState.engine === "UNKNOWN" && portState.simulation === "UNKNOWN";
      if (import.meta.env?.DEV) console.debug("[PAPERSTATE_REFRESH_SKIPPED]", { reason: "port_unavailable" });
      this.setState({ availability: notWired ? "NOT_WIRED" : "UNAVAILABLE", loading: false, error: notWired ? null : portState.error ?? null });
      return;
    }
    this.setState({ loading: true, error: null });
    const results = await Promise.allSettled([
      this.nativeReader.getAccount(),
      this.nativeReader.getPosition(),
      this.nativeReader.getOrders(),
      this.nativeReader.getFills(),
    ]);
    const accountResult = results[0];
    const positionResult = results[1];
    const ordersResult = results[2];
    const fillsResult = results[3];
    const failure = results.find((result): result is PromiseRejectedResult => result.status === "rejected");
    if (import.meta.env?.DEV && failure) {
      const error = failure.reason instanceof Error ? failure.reason.message : String(failure.reason);
      console.debug("[PAPERSTATE_REFRESH_ERROR]", { error });
    }
    if (import.meta.env?.DEV) {
      console.debug("[PAPERSTATE_REFRESH_END]", {
        account: accountResult.status,
        position: positionResult.status,
        orders: ordersResult.status,
        fills: fillsResult.status,
      });
    }
    this.debug.refreshEndCount += 1;
    this.debug.lastRefreshEndAt = Date.now();
    this.debug.lastRefreshError = failure
      ? failure.reason instanceof Error ? failure.reason.message : String(failure.reason)
      : null;
    this.setState({
      availability: accountResult.status === "fulfilled" && positionResult.status === "fulfilled" && ordersResult.status === "fulfilled" && fillsResult.status === "fulfilled" ? "PARTIAL" : "UNAVAILABLE",
      resources: {
        account: accountResult.status === "fulfilled" ? "AVAILABLE" : "UNAVAILABLE",
        position: positionResult.status === "fulfilled" ? "AVAILABLE" : "UNAVAILABLE",
        orders: ordersResult.status === "fulfilled" ? "AVAILABLE" : "UNAVAILABLE",
        trades: "NOT_WIRED",
        fills: fillsResult.status === "fulfilled" ? "AVAILABLE" : "UNAVAILABLE",
        settings: "NOT_WIRED",
      },
      account: accountResult.status === "fulfilled" ? accountResult.value : undefined,
      position: positionResult.status === "fulfilled" ? positionResult.value : null,
      orders: ordersResult.status === "fulfilled" ? ordersResult.value : [],
      fills: fillsResult.status === "fulfilled" ? fillsResult.value : [],
      loading: false,
      error: failure ? (failure.reason instanceof Error ? failure.reason : new Error(String(failure.reason))) : null,
      lastUpdatedAt: failure ? this.state.lastUpdatedAt : Date.now(),
    });
  }

  private async readJson<T>(path: string): Promise<T> {
    const response = await this.fetcher(path);
    if (!response.ok) throw new Error(`Paper ${path} sync failed (${response.status})`);
    return response.json() as Promise<T>;
  }

  private async refreshAccount(): Promise<void> {
    const account = await this.readJson<PaperAccountSnapshot>("/api/paper/account");
    if (!Number.isFinite(account.balanceUsdt) && Number.isFinite(account.equityUsdt)) {
      account.balanceUsdt = account.equityUsdt;
    }
    this.setState({ account, lastUpdatedAt: Date.now() });
  }

  private async refreshPosition(): Promise<void> {
    const data = await this.readJson<{ position: PaperPositionSnapshot | null }>("/api/paper/position");
    this.setState({ position: data.position ?? null, lastUpdatedAt: Date.now() });
  }

  private async refreshOrders(): Promise<void> {
    const data = await this.readJson<{ orders: PaperOrderSnapshot[] }>("/api/paper/orders");
    this.setState({ orders: data.orders ?? [], lastUpdatedAt: Date.now() });
  }

  private async refreshSettings(): Promise<void> {
    const settings = await this.readJson<PaperTradingSettings>("/api/paper/settings");
    this.setState({ settings, lastUpdatedAt: Date.now() });
  }

  private async refreshTrades(): Promise<void> {
    const data = await this.readJson<{ trades: PaperTradeLedgerSnapshot[] }>("/api/paper/trades");
    this.setState({ trades: data.trades ?? [], lastUpdatedAt: Date.now() });
  }

  private async checkStops(): Promise<void> {
    if (!this.canReadLegacy()) return;
    const response = await this.fetcher("/api/paper/check-stops", { method: "POST" });
    if (!response.ok) throw new Error(`Paper stop check failed (${response.status})`);
    await this.refresh();
  }

  private setState(patch: Partial<Omit<PaperState, "refresh">>): void {
    this.state = { ...this.state, ...patch };
    this.snapshot = { ...this.state, refresh: () => this.refresh() };
    this.listeners.forEach((listener) => listener());
  }
}

export const paperStateController = new PaperStateController();

// Let Vite propagate replacement to consumers and retire the old timer owner.
if (import.meta.hot) {
  import.meta.hot.dispose(() => paperStateController.dispose());
}

export function usePaperState(): PaperState {
  const { authReady, authenticated } = useTerminalAuth();
  const workspace = useSyncExternalStore(
    subscribeExecutionWorkspace,
    getExecutionWorkspace,
    getExecutionWorkspace,
  );
  const backend = useSyncExternalStore(
    (listener) => {
      window.addEventListener(PAPER_EXECUTION_STATE_CHANGED_EVENT, listener);
      return () => window.removeEventListener(PAPER_EXECUTION_STATE_CHANGED_EVENT, listener);
    },
    getPaperExecutionBackend,
    getPaperExecutionBackend,
  );
  const state = useSyncExternalStore(
    paperStateController.subscribe,
    paperStateController.getState,
    paperStateController.getState,
  );
  const portAvailability = useSyncExternalStore(
    (listener) => {
      window.addEventListener(PAPER_EXECUTION_STATE_CHANGED_EVENT, listener);
      return () => window.removeEventListener(PAPER_EXECUTION_STATE_CHANGED_EVENT, listener);
    },
    () => getPaperExecutionPortState().availability,
    () => getPaperExecutionPortState().availability,
  );

  useEffect(() => {
    paperStateController.setRuntime({ workspace, backend, authReady, authenticated });
  }, [workspace, backend, authReady, authenticated, portAvailability]);

  useEffect(() => {
    const refreshOnNativeStateChange = () => {
      if (getExecutionWorkspace() === "paper" && getPaperExecutionBackend() === "nautilus") {
        void paperStateController.refresh();
      }
    };
    window.addEventListener(PAPER_EXECUTION_STATE_CHANGED_EVENT, refreshOnNativeStateChange);
    return () => window.removeEventListener(PAPER_EXECUTION_STATE_CHANGED_EVENT, refreshOnNativeStateChange);
  }, []);

  return state;
}

export type { PaperState, PaperStateAvailability, PaperStateResources, PaperStateSource, PaperRuntime };
export function isPaperExecutionCoreReady(state: Pick<PaperState, "active" | "resources">): boolean {
  return state.active && state.resources.account === "AVAILABLE" && state.resources.position === "AVAILABLE";
}
export { EXECUTION_WORKSPACE_CHANGED_EVENT };
