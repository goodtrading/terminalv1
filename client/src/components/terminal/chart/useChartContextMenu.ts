import { useCallback, useEffect, useRef, useState } from "react";
import type { ChartMenuContext } from "./chartContextTypes";
import { clampMenuPosition } from "./chartContextTypes";

export interface UseChartContextMenuOptions {
  /** Close when these values change (e.g. symbol/timeframe). */
  closeDeps?: unknown[];
}

export function useChartContextMenu(options: UseChartContextMenuOptions = {}) {
  const { closeDeps = [] } = options;
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [context, setContext] = useState<ChartMenuContext>({ kind: "empty", price: null, time: null });
  const menuRef = useRef<HTMLDivElement | null>(null);

  const closeMenu = useCallback(() => setOpen(false), []);

  const openMenu = useCallback((clientX: number, clientY: number, ctx: ChartMenuContext) => {
    const { x, y } = clampMenuPosition(clientX, clientY);
    setPosition({ x, y });
    setContext(ctx);
    setOpen(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeMenu();
    };
    const onScroll = () => closeMenu();
    const onPointerDown = (e: PointerEvent) => {
      const el = menuRef.current;
      if (el && el.contains(e.target as Node)) return;
      closeMenu();
    };
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      document.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [open, closeMenu]);

  useEffect(() => {
    closeMenu();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional close on dependency change
  }, closeDeps);

  return {
    open,
    position,
    context,
    menuRef,
    openMenu,
    closeMenu,
  };
}
