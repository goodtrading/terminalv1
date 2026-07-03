import {
  ArrowRight,
  Droplets,
  Magnet,
  Minus,
  MousePointer2,
  Pencil,
  PenLine,
  Sparkles,
  Spline,
  Square,
  Type,
  Wind,
  Zap,
  TrendingUp,
  TrendingDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { DrawingTool, SmartToolKind } from "./types";
import { useMemo, useState } from "react";

interface DrawingsToolbarProps {
  activeTool: DrawingTool;
  panelOpensLeft?: boolean;
  onToolChange: (tool: DrawingTool) => void;
  onToolVariantSelect: (tool: DrawingTool, style?: { color?: string; lineWidth?: number; opacity?: number }) => void;
  onSmartVariantSelect: (smartKind: SmartToolKind, style?: { color?: string; lineWidth?: number; opacity?: number }) => void;
}

type PanelId = "draw" | "smart";

const railBtn =
  "w-7 h-7 min-w-[28px] min-h-[28px] flex items-center justify-center rounded-[2px] border transition-all outline-none focus-visible:ring-1 focus-visible:ring-red-500/50";

export function DrawingsToolbar({
  activeTool,
  panelOpensLeft = false,
  onToolChange,
  onToolVariantSelect,
  onSmartVariantSelect,
}: DrawingsToolbarProps) {
  const [openPanel, setOpenPanel] = useState<PanelId | null>(null);

  const drawTools = useMemo(
    () =>
      [
        { tool: "trendLine" as DrawingTool, Icon: PenLine, style: { color: "#ffffff", opacity: 1, lineWidth: 1 }, title: "Trendline" },
        { tool: "arrow" as DrawingTool, Icon: ArrowRight, style: { color: "#ffffff", opacity: 1, lineWidth: 2 }, title: "Arrow" },
        { tool: "rectangle" as DrawingTool, Icon: Square, title: "Rectangle" },
        { tool: "polyline" as DrawingTool, Icon: Spline, style: { color: "#ffffff", opacity: 1, lineWidth: 2 }, title: "Polyline" },
        { tool: "horizontalLine" as DrawingTool, Icon: Minus, style: { color: "#ffffff", opacity: 1, lineWidth: 1 }, title: "Horizontal line" },
        { tool: "text" as DrawingTool, Icon: Type, style: { color: "#ffffff", opacity: 1, lineWidth: 1 }, title: "Text" },
        { tool: "longPosition" as DrawingTool, Icon: TrendingUp, style: { color: "#22c55e", opacity: 0.9, lineWidth: 1 }, title: "Long position" },
        { tool: "shortPosition" as DrawingTool, Icon: TrendingDown, style: { color: "#ef4444", opacity: 0.9, lineWidth: 1 }, title: "Short position" },
      ] as const,
    [],
  );

  const smartTools = useMemo(
    () =>
      [
        { kind: "gammaZone" as SmartToolKind, Icon: Zap, style: { color: "#f97316", opacity: 0.45, lineWidth: 2 }, title: "Gamma zone" },
        { kind: "liquidityZone" as SmartToolKind, Icon: Droplets, style: { color: "#ef4444", opacity: 0.6, lineWidth: 2 }, title: "Liquidity zone" },
        { kind: "sweep" as SmartToolKind, Icon: Wind, style: { color: "#22c55e", opacity: 0.55, lineWidth: 2 }, title: "Sweep" },
        { kind: "magnet" as SmartToolKind, Icon: Magnet, style: { color: "#9ca3af", opacity: 0.4, lineWidth: 1 }, title: "Magnet" },
      ] as const,
    [],
  );

  return (
    <div className="relative">
      <div className="rounded-[3px] border border-white/[0.07] bg-black/45 shadow-[0_4px_10px_rgba(0,0,0,0.28)] p-0.5 flex flex-col gap-0.5">
        <button
          type="button"
          onClick={() => {
            onToolChange("select");
            setOpenPanel(null);
          }}
          className={cn(
            railBtn,
            activeTool === "select"
              ? "bg-red-950/55 text-white border-red-500/70"
              : "bg-white/[0.02] text-white/65 hover:text-white hover:bg-white/[0.05] border-white/10 hover:border-white/25",
          )}
          title="Cursor"
        >
          <MousePointer2 className="h-3.5 w-3.5" strokeWidth={1.75} />
        </button>
        <button
          type="button"
          onClick={() => setOpenPanel((prev) => (prev === "draw" ? null : "draw"))}
          className={cn(
            railBtn,
            openPanel === "draw"
              ? "bg-red-950/55 text-white border-red-500/70"
              : "bg-white/[0.02] text-white/65 hover:text-white hover:bg-white/[0.05] border-white/10 hover:border-white/25",
          )}
          title="Draw"
        >
          <Pencil className="h-3.5 w-3.5" strokeWidth={1.75} />
        </button>
        <button
          type="button"
          onClick={() => setOpenPanel((prev) => (prev === "smart" ? null : "smart"))}
          className={cn(
            railBtn,
            openPanel === "smart"
              ? "bg-red-950/55 text-white border-red-500/70"
              : "bg-white/[0.02] text-white/65 hover:text-white hover:bg-white/[0.05] border-white/10 hover:border-white/25",
          )}
          title="Smart"
        >
          <Sparkles className="h-3.5 w-3.5" strokeWidth={1.75} />
        </button>
      </div>
      {openPanel && (
        <div
          className={cn(
            "absolute top-0 rounded-[3px] border border-white/[0.07] bg-black/55 shadow-[0_4px_10px_rgba(0,0,0,0.32)] p-0.5 flex flex-col gap-0.5 min-w-[32px]",
            panelOpensLeft ? "right-8" : "left-8",
          )}
        >
          {openPanel === "draw" &&
            drawTools.map((item) => {
              const { tool, Icon, title } = item;
              const style = "style" in item ? item.style : undefined;
              return (
                <button
                  key={tool}
                  type="button"
                  onClick={() => {
                    onToolVariantSelect(tool, style);
                    setOpenPanel(null);
                  }}
                  className={cn(
                    railBtn,
                    activeTool === tool
                      ? "border-red-500/60 bg-red-950/35 text-white"
                      : "border-transparent bg-white/[0.02] text-white/70 hover:bg-white/[0.08] hover:border-white/15",
                  )}
                  title={title}
                >
                  <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
                </button>
              );
            })}
          {openPanel === "smart" &&
            smartTools.map(({ kind, Icon, style, title }) => (
              <button
                key={kind}
                type="button"
                onClick={() => {
                  onSmartVariantSelect(kind, style);
                  setOpenPanel(null);
                }}
                className={cn(
                  railBtn,
                  "border-transparent bg-white/[0.02] text-white/70 hover:bg-white/[0.08] hover:border-white/15",
                )}
                title={title}
              >
                <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
