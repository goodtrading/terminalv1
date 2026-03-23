import { cn } from "@/lib/utils";
import type { DrawingTool } from "./types";

interface DrawingsToolbarProps {
  activeTool: DrawingTool;
  onToolChange: (tool: DrawingTool) => void;
  isDrawMode: boolean;
}

/** Compact docked toolbar - cursor vs draw tools. */
const TOOLS: { id: DrawingTool; label: string; icon: string }[] = [
  { id: "select", label: "Pan / Select", icon: "✥" },
  { id: "horizontalLine", label: "H-Line", icon: "─" },
  { id: "trendLine", label: "Trend", icon: "/" },
  { id: "arrow", label: "Arrow", icon: "→" },
  { id: "rectangle", label: "Box", icon: "▭" },
  { id: "polyline", label: "Polyline", icon: "⌒" },
  { id: "text", label: "Text", icon: "T" },
];

export function DrawingsToolbar({
  activeTool,
  onToolChange,
  isDrawMode,
}: DrawingsToolbarProps) {
  return (
    <div
      className="flex flex-col gap-0.5 py-1 px-0.5 bg-black/60 border border-white/[0.08] rounded-sm"
      style={{ minWidth: 28 }}
    >
      {TOOLS.map((t) => (
        <button
          key={t.id}
          onClick={() => onToolChange(t.id)}
          className={cn(
            "w-7 h-6 flex items-center justify-center text-[10px] font-mono rounded transition-colors",
            activeTool === t.id
              ? "bg-white/15 text-white border border-white/25"
              : "text-white/50 hover:text-white/80 hover:bg-white/[0.06] border border-transparent"
          )}
          title={t.label}
        >
          {t.icon}
        </button>
      ))}
    </div>
  );
}
