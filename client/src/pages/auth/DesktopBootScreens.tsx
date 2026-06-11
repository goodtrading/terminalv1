import { useState } from "react";
import { isDesktopBuild } from "@/lib/desktopStorage";

const BOOT_STEPS = [
  "Verificando sesión",
  "Conectando con servidores",
  "Inicializando storage local",
];

export function DesktopLoadingScreen() {
  return (
    <div className="h-screen w-full flex items-center justify-center bg-terminal-bg text-terminal-text px-6">
      <div className="w-full max-w-sm border border-terminal-border bg-terminal-panel/95 rounded-sm p-7 shadow-[0_24px_80px_rgba(0,0,0,0.42)]">
        <div className="flex flex-col items-center text-center gap-5">
          <img src="/logo.png" alt="GoodTrading" className="h-12 w-auto object-contain" />
          <div className="space-y-1">
            <h1 className="text-sm font-bold tracking-widest text-white">
              Inicializando GoodTrading Terminal...
            </h1>
            <p className="text-[10px] font-mono uppercase tracking-wider text-terminal-muted">
              Desktop v0.1.0
            </p>
          </div>
          <div className="w-full space-y-2">
            {BOOT_STEPS.map((step, index) => (
              <div
                key={step}
                className="flex items-center justify-between border border-terminal-border/70 bg-terminal-bg/70 px-3 py-2 rounded-sm"
              >
                <span className="text-[11px] font-mono text-slate-300">{step}</span>
                <span
                  className={[
                    "h-1.5 w-1.5 rounded-full",
                    index === 0 ? "bg-terminal-positive animate-pulse" : "bg-slate-600",
                  ].join(" ")}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function DesktopConnectionErrorScreen({
  detail,
  onRetry,
}: {
  detail: string;
  onRetry: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-terminal-bg text-terminal-text px-6">
      <div className="w-full max-w-lg border border-red-500/35 bg-terminal-panel rounded-sm p-6 space-y-4">
        <div className="flex items-center gap-3">
          <img src="/logo.png" alt="GoodTrading" className="h-9 w-auto object-contain" />
          <div>
            <h1 className="text-base font-bold tracking-wide text-white">
              No se pudo conectar con GoodTrading
            </h1>
            <p className="text-[11px] font-mono text-terminal-muted">
              La app desktop no pudo verificar la sesión contra la API remota.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onRetry}
            className="px-3 py-2 text-[11px] font-bold tracking-widest bg-terminal-accent text-black rounded-sm hover:opacity-90"
          >
            Reintentar
          </button>
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            className="px-3 py-2 text-[11px] font-mono border border-terminal-border rounded-sm text-slate-300 hover:text-white"
          >
            Abrir diagnóstico
          </button>
        </div>

        <details open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
          <summary className="cursor-pointer text-[10px] font-mono uppercase tracking-widest text-terminal-muted">
            Detalle técnico
          </summary>
          <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded-sm border border-terminal-border bg-black/35 p-3 text-[10px] text-red-200">
            {detail || "AUTH_CONNECTION_FAILED"}
          </pre>
        </details>

        {isDesktopBuild ? (
          <p className="text-[10px] font-mono text-slate-500">
            El diagnóstico completo queda disponible en System cuando la app logra iniciar sesión.
          </p>
        ) : null}
      </div>
    </div>
  );
}

