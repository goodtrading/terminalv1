import { useSyncExternalStore } from "react";
import { getExecutionWorkspace, subscribeExecutionWorkspace } from "@/lib/executionWorkspace";
import { PaperExecutionPanel } from "./PaperExecutionPanel";


/** Workspace alone owns component identity. Backend health never selects a surface. */
export function TradingExecutionPanel({ collapsed = false }: { collapsed?: boolean }) {
  const workspace = useSyncExternalStore(
    subscribeExecutionWorkspace, getExecutionWorkspace, getExecutionWorkspace,
  );
  return <PaperExecutionPanel collapsed={collapsed} executionWorkspace={workspace} />;
}
