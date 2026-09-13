export type PaperExecutionBackend = "legacy" | "nautilus";

const PAPER_EXECUTION_STATE_CHANGED_EVENT = "goodtrading-paper-execution-state-changed";
let selectedBackend: PaperExecutionBackend = "legacy";

export function getPaperExecutionBackendState(): PaperExecutionBackend {
  return selectedBackend;
}

export function setPaperExecutionBackendState(backend: PaperExecutionBackend): PaperExecutionBackend {
  selectedBackend = backend;
  notifyPaperExecutionBackendChange();
  return selectedBackend;
}

// Compatibility aliases for existing callers while state ownership is extracted.
export const getPaperExecutionBackend = getPaperExecutionBackendState;
export const setPaperExecutionBackend = setPaperExecutionBackendState;

export function notifyPaperExecutionBackendChange(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(PAPER_EXECUTION_STATE_CHANGED_EVENT));
  }
}

export { PAPER_EXECUTION_STATE_CHANGED_EVENT };
