export type ExecutionWorkspace = "paper" | "bingx";

export const EXECUTION_WORKSPACE_STORAGE_KEY =
  "goodtrading.executionWorkspace.v1";
export const EXECUTION_WORKSPACE_CHANGED_EVENT =
  "goodtrading-execution-workspace-changed";

function readPersistedWorkspace(): ExecutionWorkspace | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const value = localStorage.getItem(EXECUTION_WORKSPACE_STORAGE_KEY);
    return value === "paper" || value === "bingx" ? value : null;
  } catch {
    return null;
  }
}

function persistWorkspace(workspace: ExecutionWorkspace): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(EXECUTION_WORKSPACE_STORAGE_KEY, workspace);
  } catch {
    // Workspace selection remains functional when storage is unavailable.
  }
}

let executionWorkspace: ExecutionWorkspace = readPersistedWorkspace() ?? "bingx";

export function getExecutionWorkspace(): ExecutionWorkspace {
  return executionWorkspace;
}

export function setExecutionWorkspace(
  workspace: ExecutionWorkspace,
): ExecutionWorkspace {
  executionWorkspace = workspace;
  persistWorkspace(workspace);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(EXECUTION_WORKSPACE_CHANGED_EVENT));
  }
  return executionWorkspace;
}

export function hydrateExecutionWorkspace(legacyPaper: boolean): ExecutionWorkspace {
  const persisted = readPersistedWorkspace();
  if (persisted) {
    if (executionWorkspace !== persisted) {
      executionWorkspace = persisted;
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event(EXECUTION_WORKSPACE_CHANGED_EVENT));
      }
    }
    return executionWorkspace;
  }
  if (legacyPaper) return setExecutionWorkspace("paper");
  return executionWorkspace;
}

export function subscribeExecutionWorkspace(listener: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener(EXECUTION_WORKSPACE_CHANGED_EVENT, listener);
  return () =>
    window.removeEventListener(EXECUTION_WORKSPACE_CHANGED_EVENT, listener);
}
