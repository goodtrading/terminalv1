import { memo, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { DrawingTool } from "./types";

interface DrawingsToolbarProps {
  activeTool: DrawingTool;
  onToolChange: (tool: DrawingTool) => void;
  isDrawMode: boolean;
}

/** Line icons: consistent 1.8 stroke, 24×24 viewBox — GoodTrading brutalist dark + red active */
const stroke = "currentColor";

function IconCursor() {
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" aria-hidden>
      <path
        d="M5.5 3.5l12.5 8-5.2 1.2 2.8 6.3-1.8.8-2.8-6.3-3.8 2.8z"
        stroke={stroke}
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconTrendline() {
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" aria-hidden>
      <path d="M5 17L19 7" stroke={stroke} strokeWidth="1.75" strokeLinecap="round" />
      <circle cx="5" cy="17" r="1.6" fill={stroke} />
      <circle cx="19" cy="7" r="1.6" fill={stroke} />
    </svg>
  );
}

function IconArrow() {
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" aria-hidden>
      <path d="M5 17L17 9" stroke={stroke} strokeWidth="1.75" strokeLinecap="round" />
      <path d="M13.5 9H17v3.5" stroke={stroke} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconRectangle() {
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" aria-hidden>
      <rect x="5" y="7" width="14" height="10" rx="1.5" stroke={stroke} strokeWidth="1.75" />
    </svg>
  );
}

function IconHLine() {
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" aria-hidden>
      <path d="M4 12h16" stroke={stroke} strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

function IconPolyline() {
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" aria-hidden>
      <path
        d="M4 16l4.5-4 4 3 7-7"
        stroke={stroke}
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

function IconText() {
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" aria-hidden>
      <path d="M7 6h10M12 6v12" stroke={stroke} strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

type ToolDef = { id: DrawingTool; label: string; icon: ReactNode };

const GROUPS: ToolDef[][] = [
  [{ id: "select", label: "Cursor / Select", icon: <IconCursor /> }],
  [
    { id: "trendLine", label: "Trend line", icon: <IconTrendline /> },
    { id: "arrow", label: "Arrow", icon: <IconArrow /> },
    { id: "rectangle", label: "Rectangle", icon: <IconRectangle /> },
    { id: "horizontalLine", label: "Horizontal line", icon: <IconHLine /> },
  ],
  [
    { id: "polyline", label: "Polyline", icon: <IconPolyline /> },
    { id: "text", label: "Text", icon: <IconText /> },
  ],
];

const FUTURE_PLACEHOLDERS = [
  { key: "liquidity", label: "Liquidity", abbr: "LQ" },
  { key: "sweep", label: "Sweep", abbr: "SW" },
  { key: "fvg", label: "FVG", abbr: "FV" },
  { key: "gamma", label: "Gamma", abbr: "Γ" },
] as const;

function ToolButton({
  active,
  label,
  onClick,
  children,
  disabled,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <div className="group/tool relative">
      <button
        type="button"
        disabled={disabled}
        onClick={onClick}
        aria-label={label}
        aria-pressed={active}
        className={cn(
          "relative flex h-9 w-9 shrink-0 items-center justify-center rounded-md border transition-[background-color,border-color,color,box-shadow] duration-150 ease-out",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0a0a]",
          disabled &&
            "cursor-not-allowed border-zinc-800/80 bg-zinc-950/50 text-zinc-600 opacity-70",
          !disabled &&
            !active && [
              "border-zinc-800/90 bg-zinc-900/80 text-zinc-400",
              "hover:border-zinc-700 hover:bg-zinc-800/90 hover:text-zinc-100",
            ],
          !disabled &&
            active && [
              "border-red-500 bg-red-600 text-white",
              "shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_0_0_1px_rgba(220,38,38,0.35),0_4px_14px_rgba(220,38,38,0.22)]",
            ]
        )}
      >
        <span className="pointer-events-none flex items-center justify-center [&_svg]:block">{children}</span>
      </button>
      {/* Tooltip — fade + slide */}
      <div
        role="tooltip"
        className={cn(
          "pointer-events-none absolute left-[calc(100%+10px)] top-1/2 z-50 -translate-y-1/2 translate-x-0.5 whitespace-nowrap rounded-md border border-zinc-700/90 bg-[#0d0d0d] px-2.5 py-1.5 font-mono text-[10px] font-medium tracking-wide text-zinc-100 opacity-0 shadow-lg transition-[opacity,transform] duration-150 ease-out",
          "group-hover/tool:translate-x-0 group-hover/tool:opacity-100"
        )}
      >
        {label}
      </div>
    </div>
  );
}

/**
 * Vertical drawing toolbox — UI only; tool IDs and callbacks unchanged from parent.
 */
export const DrawingsToolbar = memo(function DrawingsToolbar({
  activeTool,
  onToolChange,
  isDrawMode: _isDrawMode,
}: DrawingsToolbarProps) {
  return (
    <div className="pointer-events-auto select-none">
      <div
        className={cn(
          "flex flex-col gap-2 rounded-lg border border-zinc-800/95 bg-[#0a0a0a]/95 p-2 shadow-[0_12px_32px_rgba(0,0,0,0.55)] backdrop-blur-[8px]",
          "min-w-[44px]"
        )}
      >
        <div className="flex items-center justify-center border-b border-zinc-800/80 pb-2">
          <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
            Draw
          </span>
        </div>

        {GROUPS.map((group, gi) => (
          <div key={gi} className="flex flex-col gap-1.5">
            {group.map((t) => (
              <ToolButton
                key={t.id}
                active={activeTool === t.id}
                label={t.label}
                onClick={() => onToolChange(t.id)}
              >
                {t.icon}
              </ToolButton>
            ))}
            {gi < GROUPS.length - 1 && <div className="my-0.5 h-px w-full bg-zinc-800/90" aria-hidden />}
          </div>
        ))}

        <div className="my-0.5 h-px w-full bg-zinc-800/90" aria-hidden />

        <div className="flex flex-col gap-1.5 opacity-[0.92]">
          <span className="px-0.5 text-center font-mono text-[8px] uppercase tracking-wider text-zinc-600">
            Soon
          </span>
          <div className="grid grid-cols-2 gap-1.5">
            {FUTURE_PLACEHOLDERS.map((p) => (
              <ToolButton
                key={p.key}
                active={false}
                label={`${p.label} (soon)`}
                onClick={() => undefined}
                disabled
              >
                <span className="font-mono text-[9px] font-semibold text-zinc-500">{p.abbr}</span>
              </ToolButton>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
});
