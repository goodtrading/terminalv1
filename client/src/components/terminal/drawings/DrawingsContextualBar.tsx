import { useCallback, useEffect, useRef, useState } from "react";
import {
  CircleDashed,
  Droplets,
  Lock,
  Magnet,
  Palette,
  PenLine,
  Trash2,
  Unlock,
  Wind,
  X,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Drawing, SmartToolKind } from "./types";
import { LINE_WIDTHS } from "./types";

interface DrawingsContextualBarProps {
  drawing: Drawing | null;
  toolStyle: { color: string; lineWidth: number; opacity: number };
  onConvertToSmart: (smartKind: SmartToolKind) => void;
  onToolStyleChange: (updates: Partial<{ color: string; lineWidth: number; opacity: number }>) => void;
  onUpdate: (updates: Partial<Drawing>) => void;
  onDelete: () => void;
  onDeselect: () => void;
}

type PopoverId = "color" | "stroke" | "opacity" | null;

const iconBtn =
  "h-8 w-8 min-h-[32px] min-w-[32px] inline-flex items-center justify-center rounded border transition-colors outline-none focus-visible:ring-1 focus-visible:ring-red-500/50";

const palette = ["#ffffff", "#9ca3af", "#ef4444", "#f97316", "#22c55e"] as const;
const opacityPresets = [0.25, 0.5, 0.75, 1] as const;

const SMART_ICONS: Record<
  SmartToolKind,
  { Icon: typeof Zap; title: string }
> = {
  gammaZone: { Icon: Zap, title: "Gamma zone" },
  liquidityZone: { Icon: Droplets, title: "Liquidity zone" },
  sweep: { Icon: Wind, title: "Sweep" },
  magnet: { Icon: Magnet, title: "Magnet" },
};

export function DrawingsContextualBar({
  drawing,
  toolStyle,
  onConvertToSmart,
  onToolStyleChange,
  onUpdate,
  onDelete,
  onDeselect,
}: DrawingsContextualBarProps) {
  const opacity = drawing?.opacity ?? toolStyle.opacity ?? 1;
  const color = drawing?.color ?? toolStyle.color;
  const lineWidth = drawing?.lineWidth ?? toolStyle.lineWidth;

  const [open, setOpen] = useState<PopoverId>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const applyStyle = useCallback(
    (updates: Partial<{ color: string; lineWidth: number; opacity: number }>) => {
      if (drawing) onUpdate(updates);
      else onToolStyleChange(updates);
    },
    [drawing, onUpdate, onToolStyleChange]
  );

  useEffect(() => {
    const onDocDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(null);
    };
    document.addEventListener("mousedown", onDocDown);
    return () => document.removeEventListener("mousedown", onDocDown);
  }, []);

  const toggle = (id: Exclude<PopoverId, null>) => {
    setOpen((prev) => (prev === id ? null : id));
  };

  const pickColor = (c: string) => {
    applyStyle({ color: c });
    setOpen(null);
  };

  const pickWidth = (w: number) => {
    applyStyle({ lineWidth: w });
    setOpen(null);
  };

  const pickOpacity = (o: number) => {
    applyStyle({ opacity: o });
    setOpen(null);
  };

  return (
    <div ref={rootRef} className="relative rounded-md border border-white/10 bg-[#0a0a0d]/95 shadow-[0_8px_24px_rgba(0,0,0,0.55)] backdrop-blur-sm p-1">
      <div className="flex items-center gap-1">
        {/* Color */}
        <div className="relative">
          <button
            type="button"
            onClick={() => toggle("color")}
            className={cn(
              iconBtn,
              open === "color"
                ? "border-red-500/70 bg-red-950/50 text-white shadow-[0_0_0_1px_rgba(239,68,68,0.25)]"
                : "border-white/12 bg-white/[0.03] text-white/75 hover:bg-white/[0.08] hover:border-white/25",
            )}
            title="Color"
          >
            <Palette className="h-4 w-4" strokeWidth={1.75} />
          </button>
          {open === "color" && (
            <div className="absolute bottom-full left-0 mb-1 z-50 flex gap-1 rounded-lg border border-white/10 bg-[#0b0b0f]/98 p-1.5 shadow-[0_8px_30px_rgba(0,0,0,0.8)]">
              {palette.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => pickColor(c)}
                  className={cn(
                    "h-7 w-7 rounded border border-transparent transition-all hover:ring-1 hover:ring-white/35",
                    color === c ? "ring-1 ring-red-500/70 border-red-500/40" : "",
                  )}
                  title={c}
                >
                  <span
                    className="block h-full w-full rounded-[3px]"
                    style={{
                      backgroundColor: c,
                      boxShadow: c === "#ffffff" ? "inset 0 0 0 1px rgba(0,0,0,0.45)" : undefined,
                    }}
                  />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Stroke */}
        <div className="relative">
          <button
            type="button"
            onClick={() => toggle("stroke")}
            className={cn(
              iconBtn,
              open === "stroke"
                ? "border-red-500/70 bg-red-950/50 text-white shadow-[0_0_0_1px_rgba(239,68,68,0.25)]"
                : "border-white/12 bg-white/[0.03] text-white/75 hover:bg-white/[0.08] hover:border-white/25",
            )}
            title="Stroke"
          >
            <PenLine className="h-4 w-4" strokeWidth={1.75} />
          </button>
          {open === "stroke" && (
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 z-50 flex flex-col gap-0.5 rounded-lg border border-white/10 bg-[#0b0b0f]/98 p-1.5 shadow-[0_8px_30px_rgba(0,0,0,0.8)] min-w-[88px]">
              {LINE_WIDTHS.map((w) => (
                <button
                  key={w}
                  type="button"
                  onClick={() => pickWidth(w)}
                  className={cn(
                    "flex h-7 w-full items-center justify-center rounded border px-2 transition-colors",
                    lineWidth === w
                      ? "border-red-500/70 bg-red-950/45"
                      : "border-white/10 bg-white/[0.03] hover:bg-white/[0.07] hover:border-white/22",
                  )}
                  title={`${w}px`}
                >
                  <span className="inline-block rounded-full bg-white" style={{ width: 22, height: Math.max(1, w) }} />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Opacity */}
        <div className="relative">
          <button
            type="button"
            onClick={() => toggle("opacity")}
            className={cn(
              iconBtn,
              open === "opacity"
                ? "border-red-500/70 bg-red-950/50 text-white shadow-[0_0_0_1px_rgba(239,68,68,0.25)]"
                : "border-white/12 bg-white/[0.03] text-white/75 hover:bg-white/[0.08] hover:border-white/25",
            )}
            title="Opacity"
          >
            <CircleDashed className="h-4 w-4" strokeWidth={1.75} />
          </button>
          {open === "opacity" && (
            <div className="absolute bottom-full right-0 mb-1 z-50 flex gap-0.5 rounded-lg border border-white/10 bg-[#0b0b0f]/98 p-1.5 shadow-[0_8px_30px_rgba(0,0,0,0.8)]">
              {opacityPresets.map((o) => (
                <button
                  key={o}
                  type="button"
                  onClick={() => pickOpacity(o)}
                  className={cn(
                    "h-7 w-7 rounded border p-1 transition-colors",
                    Math.abs(opacity - o) < 0.01
                      ? "border-red-500/70 bg-red-950/45 ring-1 ring-red-500/30"
                      : "border-white/10 bg-black/40 hover:border-white/25",
                  )}
                  title={`${Math.round(o * 100)}%`}
                >
                  <span
                    className="block h-full w-full rounded-[2px] bg-white"
                    style={{ opacity: o }}
                  />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Smart convert (rectangle only) — icon row, no labels */}
        {drawing?.tool === "rectangle" && (
          <>
            <div className="mx-0.5 h-6 w-px bg-white/[0.08]" />
            <div className="flex items-center gap-0.5">
              {(Object.keys(SMART_ICONS) as SmartToolKind[]).map((kind) => {
                const { Icon, title } = SMART_ICONS[kind];
                const active = drawing.smartKind === kind;
                return (
                  <button
                    key={kind}
                    type="button"
                    onClick={() => {
                      onConvertToSmart(kind);
                      setOpen(null);
                    }}
                    className={cn(
                      iconBtn,
                      "h-8 w-8",
                      active
                        ? "border-red-500/70 bg-red-950/45 text-white"
                        : "border-white/10 bg-white/[0.03] text-white/55 hover:bg-white/[0.08] hover:text-white/90 hover:border-white/22",
                    )}
                    title={title}
                  >
                    <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
                  </button>
                );
              })}
            </div>
          </>
        )}

        {drawing && (
          <>
            <div className="mx-0.5 h-6 w-px bg-white/[0.08]" />
            <button
              type="button"
              onClick={() => onUpdate({ locked: !drawing.locked })}
              className={cn(
                iconBtn,
                drawing.locked
                  ? "border-amber-600/45 bg-amber-950/25 text-amber-300 hover:bg-amber-950/40"
                  : "border-white/12 bg-white/[0.03] text-white/65 hover:bg-white/[0.08] hover:border-white/25",
              )}
              title={drawing.locked ? "Unlock" : "Lock"}
            >
              {drawing.locked ? <Unlock className="h-4 w-4" strokeWidth={1.75} /> : <Lock className="h-4 w-4" strokeWidth={1.75} />}
            </button>
            <button
              type="button"
              onClick={onDelete}
              className={cn(iconBtn, "border-red-900/50 bg-red-950/35 text-red-400 hover:bg-red-900/45 hover:border-red-500/50")}
              title="Delete"
            >
              <Trash2 className="h-4 w-4" strokeWidth={1.75} />
            </button>
            <button
              type="button"
              onClick={onDeselect}
              className={cn(iconBtn, "border-white/10 bg-white/[0.03] text-white/45 hover:bg-white/[0.08] hover:text-white/90")}
              title="Deselect"
            >
              <X className="h-4 w-4" strokeWidth={1.75} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
