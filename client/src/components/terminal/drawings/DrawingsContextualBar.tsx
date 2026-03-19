import { cn } from "@/lib/utils";
import type { Drawing } from "./types";
import { DRAWING_COLORS, LINE_WIDTHS, OPACITY_PRESETS } from "./types";

interface DrawingsContextualBarProps {
  drawing: Drawing;
  onUpdate: (updates: Partial<Drawing>) => void;
  onDelete: () => void;
  onDeselect: () => void;
}

/** Compact contextual controls when a drawing is selected. */
export function DrawingsContextualBar({
  drawing,
  onUpdate,
  onDelete,
  onDeselect,
}: DrawingsContextualBarProps) {
  const opacity = drawing.opacity ?? 0.9;

  return (
    <div className="flex flex-wrap items-center gap-2 px-2 py-1.5 bg-black/80 border border-white/[0.12] rounded text-[10px] font-mono">
      <span className="text-white/40">Edit</span>
      <div className="flex items-center gap-0.5">
        {DRAWING_COLORS.map((c) => (
          <button
            key={c}
            onClick={() => onUpdate({ color: c })}
            className={cn(
              "w-3.5 h-3.5 rounded-sm border transition-opacity",
              drawing.color === c
                ? "border-white ring-1 ring-white/50"
                : "border-white/20 opacity-70 hover:opacity-100"
            )}
            style={{
              backgroundColor: c,
              boxShadow: c === "#ffffff" ? "inset 0 0 0 1px rgba(0,0,0,0.3)" : undefined,
            }}
            title={c}
          />
        ))}
      </div>
      <div className="w-px h-4 bg-white/10" />
      <div className="flex items-center gap-0.5">
        <span className="text-white/40 text-[9px]">W</span>
        {LINE_WIDTHS.map((w) => (
          <button
            key={w}
            onClick={() => onUpdate({ lineWidth: w })}
            className={cn(
              "px-1 py-0.5 rounded text-[9px]",
              drawing.lineWidth === w
                ? "bg-white/20 text-white"
                : "text-white/50 hover:text-white/80"
            )}
          >
            {w}
          </button>
        ))}
      </div>
      <div className="w-px h-4 bg-white/10" />
      <div className="flex items-center gap-0.5">
        <span className="text-white/40 text-[9px]">α</span>
        {OPACITY_PRESETS.map((o) => (
          <button
            key={o}
            onClick={() => onUpdate({ opacity: o })}
            className={cn(
              "px-1 py-0.5 rounded text-[9px]",
              Math.abs(opacity - o) < 0.05
                ? "bg-white/20 text-white"
                : "text-white/50 hover:text-white/80"
            )}
          >
            {Math.round(o * 100)}%
          </button>
        ))}
      </div>
      <div className="w-px h-4 bg-white/10" />
      <button
        onClick={() => onUpdate({ locked: !drawing.locked })}
        className={cn(
          "px-1.5 py-0.5 rounded text-[9px]",
          drawing.locked
            ? "bg-amber-500/20 text-amber-400"
            : "text-white/50 hover:text-white/80"
        )}
        title={drawing.locked ? "Unlock" : "Lock"}
      >
        {drawing.locked ? "⊘" : "◎"}
      </button>
      <button
        onClick={onDelete}
        className="px-1.5 py-0.5 rounded text-[9px] text-red-400/80 hover:text-red-400 hover:bg-red-500/20"
        title="Delete"
      >
        Del
      </button>
      <button
        onClick={onDeselect}
        className="px-1.5 py-0.5 rounded text-[9px] text-white/50 hover:text-white/80"
        title="Deselect"
      >
        ✕
      </button>
    </div>
  );
}
