import type { RefObject } from "react";
import { cn } from "@/lib/utils";
import type { ChartMenuContext, ChartMenuOverlayKind } from "./chartContextTypes";

export type ChartContextMenuAction =
  | { type: "reset_view" }
  | { type: "copy_price"; price: number }
  | { type: "add_alert" }
  | { type: "add_drawing" }
  | { type: "lock_vertical_time" }
  | { type: "toggle_overlays" }
  | { type: "open_settings" }
  | { type: "drawing_edit_style"; drawingId: string }
  | { type: "drawing_duplicate"; drawingId: string }
  | { type: "drawing_lock"; drawingId: string; locked: boolean }
  | { type: "drawing_delete"; drawingId: string }
  | { type: "overlay_details"; overlayKind: ChartMenuOverlayKind }
  | { type: "overlay_highlight"; overlayKind: ChartMenuOverlayKind }
  | { type: "overlay_hide_layer"; overlayKind: ChartMenuOverlayKind };

interface ChartContextMenuProps {
  open: boolean;
  x: number;
  y: number;
  context: ChartMenuContext;
  menuRef: RefObject<HTMLDivElement | null>;
  onClose: () => void;
  onAction: (action: ChartContextMenuAction) => void;
}

function Separator() {
  return <div className="h-px bg-white/[0.08] my-1" />;
}

function Item({
  children,
  onClick,
  danger,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "w-full text-left px-2.5 py-1.5 text-[11px] font-mono rounded-sm transition-colors",
        disabled
          ? "text-white/25 cursor-not-allowed"
          : danger
            ? "text-red-400/95 hover:bg-red-950/40 hover:text-red-300"
            : "text-white/85 hover:bg-white/[0.06] hover:text-white",
      )}
    >
      {children}
    </button>
  );
}

export function ChartContextMenu({ open, x, y, context, menuRef, onClose, onAction }: ChartContextMenuProps) {
  if (!open) return null;

  const priceForCopy = context.kind === "empty" || context.kind === "drawing" ? context.price : null;

  const run = (a: ChartContextMenuAction) => {
    onAction(a);
    onClose();
  };

  return (
    <div
      ref={menuRef}
      className="fixed z-[200] min-w-[220px] rounded-md border border-white/12 bg-[#0c0c10]/98 shadow-[0_12px_40px_rgba(0,0,0,0.85)] backdrop-blur-md py-1"
      style={{ left: x, top: y }}
      role="menu"
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="flex flex-col">
        {context.kind === "drawing" && (
          <>
            <div className="px-2.5 pt-1 pb-0.5 text-[9px] uppercase tracking-wider text-white/40 font-mono">Dibujo</div>
            <Item onClick={() => run({ type: "drawing_edit_style", drawingId: context.drawing.id })}>Editar estilo</Item>
            <Item onClick={() => run({ type: "drawing_duplicate", drawingId: context.drawing.id })}>Duplicar</Item>
            <Item
              onClick={() =>
                run({ type: "drawing_lock", drawingId: context.drawing.id, locked: !context.drawing.locked })
              }
            >
              {context.drawing.locked ? "Desbloquear" : "Bloquear"}
            </Item>
            <Item danger onClick={() => run({ type: "drawing_delete", drawingId: context.drawing.id })}>
              Eliminar
            </Item>
            <Separator />
          </>
        )}

        {context.kind === "overlay" && (
          <>
            <div className="px-2.5 pt-1 pb-0.5 text-[9px] uppercase tracking-wider text-white/40 font-mono">Capa</div>
            <Item onClick={() => run({ type: "overlay_details", overlayKind: context.overlayKind })}>Mostrar detalles</Item>
            <Item onClick={() => run({ type: "overlay_highlight", overlayKind: context.overlayKind })}>Resaltar</Item>
            <Item onClick={() => run({ type: "overlay_hide_layer", overlayKind: context.overlayKind })}>Ocultar esta capa</Item>
            <Separator />
          </>
        )}

        <Item onClick={() => run({ type: "reset_view" })}>Restablecer visualización del gráfico</Item>
        <Item
          disabled={priceForCopy == null}
          onClick={() => {
            if (priceForCopy != null) run({ type: "copy_price", price: priceForCopy });
          }}
        >
          Copiar precio
        </Item>
        <Item onClick={() => run({ type: "add_alert" })}>Añadir alerta</Item>
        <Item onClick={() => run({ type: "add_drawing" })}>Añadir dibujo</Item>
        <Item onClick={() => run({ type: "lock_vertical_time" })}>Bloquear línea vertical del cursor por tiempo</Item>
        <Item onClick={() => run({ type: "toggle_overlays" })}>Mostrar/Ocultar overlays</Item>
        <Separator />
        <Item onClick={() => run({ type: "open_settings" })}>Opciones de configuración…</Item>
      </div>
    </div>
  );
}
