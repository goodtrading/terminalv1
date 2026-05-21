import type { TerminalExecutionContext } from "./executionContextTypes";
import { DEFAULT_TERMINAL_EXECUTION_CONTEXT } from "./defaultExecutionContext";

/** Execution context when simulating on BingX perpetual (no live orders). */
export function getPaperTerminalExecutionContext(): TerminalExecutionContext {
  return {
    ...DEFAULT_TERMINAL_EXECUTION_CONTEXT,
    mode: "paper",
    liveTradingEnabled: false,
  };
}
