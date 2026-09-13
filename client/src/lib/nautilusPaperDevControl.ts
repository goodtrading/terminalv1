import {
  activateNautilusPaperBackend,
  deactivateNautilusPaperBackend,
  getPaperExecutionPortState,
  setPaperExecutionBackend,
  type PaperExecutionPortState,
} from "./paperExecutionPort";
import { isTauriRuntime } from "./desktopRuntime";
import { nautilusEngine } from "./nautilusEngineBridge";
import { nautilusSimulation } from "./nautilusSimulationBridge";

export type NautilusPaperDevControl = {
  activate: () => Promise<PaperExecutionPortState>;
  deactivate: () => Promise<PaperExecutionPortState>;
  status: () => PaperExecutionPortState;
  getPosition: typeof nautilusSimulation.getPosition;
  getAccount: typeof nautilusSimulation.getAccount;
};

declare global {
  interface Window {
    __GT_NAUTILUS_PAPER_DEV__?: NautilusPaperDevControl;
  }
}

export type NautilusPaperDevControlDependencies = {
  setBackend: typeof setPaperExecutionBackend;
  activate: typeof activateNautilusPaperBackend;
  deactivate: typeof deactivateNautilusPaperBackend;
  getState: typeof getPaperExecutionPortState;
  getPosition: typeof nautilusSimulation.getPosition;
  getAccount: typeof nautilusSimulation.getAccount;
};

const defaultDependencies: NautilusPaperDevControlDependencies = {
  setBackend: setPaperExecutionBackend,
  activate: activateNautilusPaperBackend,
  deactivate: deactivateNautilusPaperBackend,
  getState: getPaperExecutionPortState,
  getPosition: nautilusSimulation.getPosition,
  getAccount: nautilusSimulation.getAccount,
};

export function shouldInstallNautilusPaperDevControl(
  dev: boolean,
  tauri: boolean,
): boolean {
  return dev && tauri;
}

export function shouldExposeNautilusPaperControl(
  _dev: boolean,
  tauri: boolean,
): boolean {
  return tauri;
}

export function createNautilusPaperDevControl(
  deps: NautilusPaperDevControlDependencies = defaultDependencies,
): NautilusPaperDevControl {
  return {
    async activate() {
      deps.setBackend("nautilus");
      return deps.activate();
    },
    async deactivate() {
      await deps.deactivate();
      deps.setBackend("legacy");
      return deps.getState();
    },
    status() {
      return deps.getState();
    },
    getPosition: deps.getPosition,
    getAccount: deps.getAccount,
  };
}

type InstallOptions = {
  dev?: boolean;
  tauri?: boolean;
  target?: Window;
};

export function installNautilusPaperDevControl(options: InstallOptions = {}): void {
  const dev = options.dev ?? import.meta.env?.DEV === true;
  const tauri = options.tauri ?? isTauriRuntime();
  const target = options.target ?? (typeof window === "undefined" ? undefined : window);
  if (!target || !shouldInstallNautilusPaperDevControl(dev, tauri)) return;

  target.__GT_NAUTILUS_PAPER_DEV__ = createNautilusPaperDevControl();
}
