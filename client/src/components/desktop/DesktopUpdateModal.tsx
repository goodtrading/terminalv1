import { useMemo } from "react";
import { useDesktopUpdateCheck } from "@/hooks/useDesktopUpdateCheck";
import { isDesktopBuild } from "@/lib/desktopStorage";
import { cn } from "@/lib/utils";

function formatPublishedAt(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}

export function DesktopUpdateModal() {
  const {
    update,
    shouldShowOptionalModal,
    dismissOptional,
    downloadUpdate,
    downloadError,
  } = useDesktopUpdateCheck();

  const isRequired = update.updateStatus === "required_update";
  const isOptional = shouldShowOptionalModal;
  const publishedAt = useMemo(() => formatPublishedAt(update.publishedAt), [update.publishedAt]);

  if (!isDesktopBuild || (!isRequired && !isOptional)) return null;

  return (
    <div
      className={cn(
        "fixed inset-0 z-[1000] flex items-center justify-center bg-black/80 px-4 backdrop-blur-sm",
        isRequired && "pointer-events-auto",
      )}
      role="dialog"
      aria-modal={isRequired}
    >
      <div className="w-full max-w-lg border border-terminal-border bg-terminal-panel p-6 rounded-sm shadow-2xl">
        <div className="flex items-start gap-4">
          <img src="/logo.png" alt="GoodTrading" className="h-16 w-auto object-contain shrink-0" />
          <div className="min-w-0 flex-1 space-y-2">
            <div>
              <p className="text-[10px] uppercase tracking-[0.22em] text-terminal-muted font-mono">
                GoodTrading Terminal
              </p>
              <h1 className="text-lg font-bold tracking-wide text-white">
                {isRequired ? "Actualización obligatoria" : "Nueva actualización disponible"}
              </h1>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              {isRequired
                ? "Tu versión actual ya no está soportada"
                : "Hay una nueva versión disponible para GoodTrading Terminal."}
            </p>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2 text-[10px] font-mono max-[520px]:grid-cols-1">
          <div className="border border-terminal-border/70 rounded px-2 py-1.5">
            <p className="text-slate-600 uppercase">Versión actual</p>
            <p className="text-slate-200">{update.currentVersion}</p>
          </div>
          <div className="border border-terminal-border/70 rounded px-2 py-1.5">
            <p className="text-slate-600 uppercase">Nueva versión</p>
            <p className="text-terminal-accent">{update.latestVersion ?? "unknown"}</p>
          </div>
          {isRequired ? (
            <div className="border border-red-500/35 rounded px-2 py-1.5">
              <p className="text-red-400/70 uppercase">Mínima soportada</p>
              <p className="text-red-300">{update.minSupportedVersion ?? "unknown"}</p>
            </div>
          ) : null}
          {publishedAt ? (
            <div className="border border-terminal-border/70 rounded px-2 py-1.5">
              <p className="text-slate-600 uppercase">Publicado</p>
              <p className="text-slate-300">{publishedAt}</p>
            </div>
          ) : null}
        </div>

        {update.releaseNotes.length > 0 ? (
          <div className="mt-4 space-y-1">
            <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Notas</p>
            <ul className="space-y-1 text-xs text-slate-300 leading-relaxed">
              {update.releaseNotes.map((note) => (
                <li key={note} className="border-l border-terminal-accent/50 pl-2">
                  {note}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {downloadError ? (
          <div className="mt-4 rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300 font-mono">
            {downloadError}
          </div>
        ) : null}

        <div className="mt-5 flex items-center justify-end gap-2">
          {!isRequired ? (
            <button
              type="button"
              onClick={dismissOptional}
              className="px-3 py-2 text-xs font-bold rounded border border-terminal-border text-slate-300 hover:text-white"
            >
              Más tarde
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => void downloadUpdate()}
            className="px-3 py-2 text-xs font-bold rounded bg-terminal-accent text-black hover:opacity-90"
          >
            Descargar actualización
          </button>
        </div>
      </div>
    </div>
  );
}
