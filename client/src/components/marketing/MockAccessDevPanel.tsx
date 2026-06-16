import { usePlatformAccess } from "@/hooks/usePlatformAccess";
import type { MockAccessMode } from "@/lib/platformAccess";

const MODES: { id: MockAccessMode; label: string }[] = [
  { id: "off", label: "Real auth" },
  { id: "visitor", label: "Visitante" },
  { id: "logged_in", label: "Logueado sin plan" },
  { id: "active", label: "Cliente activo" },
];

/** Dev-only mock switcher for marketing access states. Hidden in production builds. */
export function MockAccessDevPanel() {
  if (!import.meta.env.DEV) return null;

  const { mockAccessMode, setMockAccessMode, terminalRedirect } = usePlatformAccess();

  return (
    <div className="fixed bottom-4 right-4 z-[100] max-w-xs rounded-xl border border-amber-500/30 bg-[#0a0a0a]/95 p-3 text-xs shadow-lg backdrop-blur">
      <p className="mb-2 font-semibold text-amber-200">Mock access (dev)</p>
      <div className="flex flex-wrap gap-1.5">
        {MODES.map((mode) => (
          <button
            key={mode.id}
            type="button"
            onClick={() => setMockAccessMode(mode.id)}
            className={
              mockAccessMode === mode.id
                ? "rounded-md bg-amber-500/20 px-2 py-1 text-amber-100"
                : "rounded-md border border-white/10 px-2 py-1 text-[#9ca3af] hover:text-white"
            }
          >
            {mode.label}
          </button>
        ))}
      </div>
      <p className="mt-2 font-mono text-[10px] text-[#6b7280]">Terminal → {terminalRedirect}</p>
    </div>
  );
}
