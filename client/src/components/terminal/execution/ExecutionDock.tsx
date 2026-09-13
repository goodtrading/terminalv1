import { TradingExecutionPanel } from "./TradingExecutionPanel";

export function ExecutionDock({ collapsed }: { collapsed: boolean }) {
  return <TradingExecutionPanel collapsed={collapsed} />;
}
