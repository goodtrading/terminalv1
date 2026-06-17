import type { ReactNode } from "react";
import { ChevronDown, ChevronUp, GripVertical, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DrawingToolbarPosition } from "@/lib/drawingToolbarPosition";

type MovableDrawingToolbarShellProps = {
  position: DrawingToolbarPosition;
  onToggleCollapsed: () => void;
  onResetPosition: () => void;
  onDragHandlePointerDown: (event: React.PointerEvent<HTMLElement>) => void;
  onDragHandlePointerMove: (event: React.PointerEvent<HTMLElement>) => void;
  onDragHandlePointerUp: (event: React.PointerEvent<HTMLElement>) => void;
  children: ReactNode;
};

export function MovableDrawingToolbarShell({
  position,
  onToggleCollapsed,
  onResetPosition,
  onDragHandlePointerDown,
  onDragHandlePointerMove,
  onDragHandlePointerUp,
  children,
}: MovableDrawingToolbarShellProps) {
  return (
    <div
      className="absolute z-[20] pointer-events-auto flex flex-col gap-1"
      style={{ left: position.x, top: position.y }}
      title="Drawing tools"
    >
      <div className="flex items-center gap-0.5 rounded-md border border-white/10 bg-[#0b0b0f]/95 px-0.5 py-0.5 shadow-[0_4px_12px_rgba(0,0,0,0.35)] backdrop-blur-sm">
        <button
          type="button"
          aria-label="Mover barra de herramientas"
          className="flex h-6 w-5 cursor-grab items-center justify-center rounded text-white/45 hover:bg-white/[0.06] hover:text-white/80 active:cursor-grabbing"
          onPointerDown={onDragHandlePointerDown}
          onPointerMove={onDragHandlePointerMove}
          onPointerUp={onDragHandlePointerUp}
          onPointerCancel={onDragHandlePointerUp}
        >
          <GripVertical className="h-3.5 w-3.5" strokeWidth={1.75} />
        </button>
        <button
          type="button"
          aria-label={position.collapsed ? "Expandir herramientas" : "Minimizar herramientas"}
          className="flex h-6 w-6 items-center justify-center rounded text-white/55 hover:bg-white/[0.06] hover:text-white"
          onClick={onToggleCollapsed}
        >
          {position.collapsed ? (
            <ChevronDown className="h-3.5 w-3.5" strokeWidth={1.75} />
          ) : (
            <ChevronUp className="h-3.5 w-3.5" strokeWidth={1.75} />
          )}
        </button>
        <button
          type="button"
          aria-label="Restablecer posición"
          className="flex h-6 w-6 items-center justify-center rounded text-white/55 hover:bg-white/[0.06] hover:text-white"
          onClick={onResetPosition}
        >
          <RotateCcw className="h-3 w-3" strokeWidth={1.75} />
        </button>
      </div>

      <div className={cn(position.collapsed && "hidden")}>{children}</div>
    </div>
  );
}
