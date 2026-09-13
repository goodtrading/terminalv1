import type { ExecutionWorkspace } from "@/lib/executionWorkspace";
import { TerminalPanel } from "../TerminalPanel";
import { PaperTradingExecutionBlock } from "./PaperTradingExecutionBlock";

/** Stable Paper shell: no broker session, readiness branch, or backend key. */
export function PaperOrderEntryPanel({ collapsed = false, executionWorkspace = "paper" }: { collapsed?: boolean; executionWorkspace?: ExecutionWorkspace }) {
  return (
    <TerminalPanel
      title="TRADING EXECUTION"
      collapsed={collapsed}
      noPadding
      headerExtra={<span className="text-[7px] font-bold uppercase tracking-wider text-cyan-300">{executionWorkspace === "paper" ? "PAPER MODE · No real funds" : `${executionWorkspace.toUpperCase()} · Execution adapter not wired`}</span>}
      className="flex-[0.65] min-w-[260px] min-h-0 max-[1200px]:min-w-[220px] max-[1000px]:min-w-0 max-[1000px]:flex-1"
    >
      <div className="flex flex-col gap-2 p-2 overflow-y-auto max-h-full text-[12px] font-mono">
        <PaperTradingExecutionBlock executionWorkspace={executionWorkspace} />
      </div>
    </TerminalPanel>
  );
}
