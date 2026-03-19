import { useEffect, useMemo, useRef, useState } from "react";
import { AIChatPanel } from "./AIChatPanel";

type BottomTabId = "ai" | "logs" | "notes";

const STORAGE_KEY_COLLAPSED = "goodtrading.bottomDock.ai.collapsed";
const STORAGE_KEY_EXPANDED_HEIGHT = "goodtrading.bottomDock.ai.expandedHeightPx";

const MIN_HEIGHT_PX = 80;

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function getViewportHeights() {
  const h = typeof window !== "undefined" ? window.innerHeight : 900;
  return {
    min: MIN_HEIGHT_PX,
    max: Math.floor(h * 0.6),
    defaultExpanded: Math.floor(h * 0.25),
  };
}

export function BottomPanel() {
  const dockRef = useRef<HTMLDivElement | null>(null);

  const initial = useMemo(() => {
    const { max, defaultExpanded } = getViewportHeights();
    return {
      expandedHeightPx: clamp(defaultExpanded, MIN_HEIGHT_PX, max),
      collapsed: false,
    };
  }, []);

  const [activeTab, setActiveTab] = useState<BottomTabId>("ai");
  const [collapsed, setCollapsed] = useState<boolean>(initial.collapsed);
  const [expandedHeightPx, setExpandedHeightPx] = useState<number>(initial.expandedHeightPx);
  const [isDragging, setIsDragging] = useState(false);

  const displayedHeightPx = collapsed ? MIN_HEIGHT_PX : expandedHeightPx;

  const triggerChartResize = () => {
    // Wait two frames so layout settles after height transition/DOM reflow.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.dispatchEvent(new Event("resize"));
      });
    });
  };

  // On collapse/expand, resize after state settles.
  useEffect(() => {
    triggerChartResize();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collapsed]);

  // Load persisted state.
  useEffect(() => {
    try {
      const collapsedRaw = localStorage.getItem(STORAGE_KEY_COLLAPSED);
      const expandedRaw = localStorage.getItem(STORAGE_KEY_EXPANDED_HEIGHT);

      const { max } = getViewportHeights();

      if (collapsedRaw === "true" || collapsedRaw === "false") {
        const c = collapsedRaw === "true";
        setCollapsed(c);
      }

      const expanded = expandedRaw ? Number(expandedRaw) : NaN;
      if (Number.isFinite(expanded) && expanded > 0) {
        setExpandedHeightPx(clamp(expanded, MIN_HEIGHT_PX, max));
      }
    } catch {
      // Ignore storage errors (private mode etc.)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist state changes.
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_COLLAPSED, String(collapsed));
      localStorage.setItem(STORAGE_KEY_EXPANDED_HEIGHT, String(expandedHeightPx));
    } catch {
      // ignore
    }
  }, [collapsed, expandedHeightPx]);

  // Resize drag logic.
  const onPointerDown = (e: import("react").PointerEvent) => {
    if (collapsed) return;
    const dock = dockRef.current;
    if (!dock) return;

    const parentRect = dock.getBoundingClientRect();
    const bottom = parentRect.bottom;
    setIsDragging(true);

    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);

    const { min, max } = getViewportHeights();

    const onMove = (ev: PointerEvent) => {
      const newHeight = bottom - ev.clientY;
      setExpandedHeightPx(clamp(Math.floor(newHeight), min, max));
    };

    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      setIsDragging(false);
      triggerChartResize();
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const toggleCollapsed = () => {
    setCollapsed((v) => !v);
  };

  return (
    <div
      ref={dockRef}
      className="w-full shrink-0 bg-terminal-bg border-t border-terminal-border flex flex-col"
      style={{
        height: displayedHeightPx,
        transition: isDragging ? "none" : "height 180ms ease",
      }}
    >
      {/* Drag bar (top edge) */}
      <div
        className={`h-2 w-full border-b border-terminal-border ${
          collapsed ? "cursor-pointer" : "cursor-ns-resize hover:bg-white/5"
        }`}
        onPointerDown={onPointerDown}
        onClick={() => {
          if (!collapsed) return;
          toggleCollapsed();
        }}
        title={collapsed ? "Expand AI Analyst dock" : "Resize AI Analyst dock"}
      />

      {/* Tabs + controls */}
      <div className="flex items-center justify-between px-2 py-1 border-b border-terminal-border bg-terminal-panel/20">
        <div className="flex items-center gap-1">
          <TabButton id="ai" active={activeTab === "ai"} label="AI Analyst" onClick={() => setActiveTab("ai")} />
          <TabButton id="logs" active={activeTab === "logs"} label="Logs" onClick={() => setActiveTab("logs")} />
          <TabButton id="notes" active={activeTab === "notes"} label="Notes" onClick={() => setActiveTab("notes")} />
        </div>

        <button
          type="button"
          onClick={toggleCollapsed}
          className="text-[10px] px-2 py-1 rounded border border-terminal-border/60 bg-black/10 text-white/70 hover:text-white/90"
        >
          {collapsed ? "Expand" : "Min"}
        </button>
      </div>

      {/* Content */}
      <div className={`flex-1 min-h-0 overflow-hidden ${collapsed ? "hidden" : ""}`}>
        {/* Keep AIChatPanel mounted so auto-alert detection can continue while hidden */}
        <div className={activeTab === "ai" ? "h-full min-h-0" : "hidden"}>
          <AIChatPanel />
        </div>
        {activeTab !== "ai" ? (
          <div className="h-full min-h-0 flex items-center justify-center text-[11px] text-white/40 font-mono p-2">
            {activeTab === "logs" ? "Logs panel placeholder" : "Notes panel placeholder"}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function TabButton({
  id,
  active,
  label,
  onClick,
}: {
  id: string;
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "text-[10px] px-2 py-1 rounded border transition-colors",
        active ? "border-white/20 bg-white/5 text-white/90" : "border-transparent text-white/60 hover:text-white/80",
      ].join(" ")}
      data-tab={id}
    >
      {label}
    </button>
  );
}

