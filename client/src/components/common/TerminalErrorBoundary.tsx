import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = {
  children: ReactNode;
  name?: string;
  fallbackMessage?: string;
};

type State = {
  error: Error | null;
};

/**
 * Isolates render crashes so one module cannot black-screen the whole terminal.
 */
export class TerminalErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    const label = this.props.name ?? "terminal-module";
    console.error(
      `[error-boundary:${label}]`,
      error.message,
      info.componentStack ?? "",
    );
  }

  render(): ReactNode {
    if (this.state.error) {
      const message =
        this.props.fallbackMessage ??
        "Module crashed. Reload terminal or switch panel.";
      return (
        <div className="flex flex-col items-center justify-center gap-2 p-4 min-h-[80px] border border-red-900/40 bg-red-950/20 text-center">
          <p className="text-[11px] font-mono text-red-300/90">{message}</p>
          <p className="text-[9px] font-mono text-slate-600 max-w-md truncate">
            {this.state.error.message}
          </p>
          <button
            type="button"
            onClick={() => this.setState({ error: null })}
            className="text-[10px] uppercase tracking-wider text-cyan-500/80 hover:text-cyan-300 border border-white/10 px-2 py-1"
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
