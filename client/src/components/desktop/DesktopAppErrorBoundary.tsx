import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = {
  children: ReactNode;
};

type State = {
  error: Error | null;
};

/** Catches root render failures so Tauri does not stay on a blank screen. */
export class DesktopAppErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("[desktop-app-error-boundary]", error.message, info.componentStack ?? "");
  }

  render(): ReactNode {
    if (!this.state.error) {
      return this.props.children;
    }

    const showDetail = import.meta.env.DEV;

    return (
      <div className="flex min-h-screen w-full items-center justify-center bg-[#030303] px-6 text-[#f3f4f6]">
        <div className="w-full max-w-lg space-y-4 rounded-[22px] border border-red-500/35 bg-[#050505]/95 p-6 text-center">
          <img src="/logo.png" alt="GoodTrading" className="mx-auto h-20 w-auto object-contain" />
          <h1 className="text-lg font-bold text-white">Error al cargar GoodTrading Desktop</h1>
          {showDetail ? (
            <p className="break-words text-sm font-mono text-red-200/90">{this.state.error.message}</p>
          ) : (
            <p className="text-sm text-[#9ca3af]">
              Reiniciá la aplicación. Si el problema continúa, contactá soporte.
            </p>
          )}
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-xl bg-[#ff3b3b] px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90"
          >
            Reintentar
          </button>
        </div>
      </div>
    );
  }
}
