import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";

type FlickeringGridProps = {
  className?: string;
  squareSize?: number;
  gridGap?: number;
  color?: string;
  maxOpacity?: number;
  flickerChance?: number;
  animationInterval?: number;
};

type GridSize = {
  width: number;
  height: number;
};

type GridCell = {
  x: number;
  y: number;
  opacity: number;
};

const MOBILE_BREAKPOINT = 640;
const DEFAULT_SIZE = { width: 1, height: 1 };

function getReducedMotionPreference() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function FlickeringGrid({
  className,
  squareSize = 3,
  gridGap = 14,
  color = "#6b7280",
  maxOpacity = 0.16,
  flickerChance = 0.018,
  animationInterval = 140,
}: FlickeringGridProps) {
  const containerRef = useRef<SVGSVGElement>(null);
  const cellsRef = useRef<SVGRectElement[]>([]);
  const [size, setSize] = useState<GridSize>(DEFAULT_SIZE);
  const [reducedMotion, setReducedMotion] = useState(getReducedMotionPreference);
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const updateSize = () => {
      const bounds = element.getBoundingClientRect();
      setSize((previous) => {
        const width = Math.max(1, Math.ceil(bounds.width));
        const height = Math.max(1, Math.ceil(bounds.height));
        return previous.width === width && previous.height === height ? previous : { width, height };
      });
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const observer = new IntersectionObserver(([entry]) => {
      setIsVisible(entry.isIntersecting);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = () => setReducedMotion(mediaQuery.matches);
    updatePreference();
    mediaQuery.addEventListener("change", updatePreference);
    return () => mediaQuery.removeEventListener("change", updatePreference);
  }, []);

  const effectiveGap = size.width <= MOBILE_BREAKPOINT ? Math.max(gridGap, 18) : gridGap;
  const effectiveFlickerChance = size.width <= MOBILE_BREAKPOINT ? flickerChance * 0.5 : flickerChance;
  const effectiveAnimationInterval = size.width <= MOBILE_BREAKPOINT ? Math.max(animationInterval, 220) : animationInterval;
  const cells = useMemo<GridCell[]>(() => {
    const stride = squareSize + effectiveGap;
    const columns = Math.ceil(size.width / stride);
    const rows = Math.ceil(size.height / stride);
    const nextCells: GridCell[] = [];

    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const x = column * stride;
        const y = row * stride;
        const centerX = size.width / 2;
        const centerY = size.height / 2;
        const distance = Math.sqrt(((x - centerX) / size.width) ** 2 + ((y - centerY) / size.height) ** 2);
        const centerWeight = Math.max(0, 1 - distance * 1.9);
        nextCells.push({ x, y, opacity: maxOpacity * (0.16 + centerWeight * 0.5) });
      }
    }

    return nextCells;
  }, [effectiveGap, maxOpacity, size.height, size.width, squareSize]);

  useEffect(() => {
    cellsRef.current.length = cells.length;
    cellsRef.current.forEach((cell, index) => {
      cell?.setAttribute("opacity", String(cells[index]?.opacity ?? 0));
    });

    if (reducedMotion || !isVisible || cells.length === 0) return;

    const interval = window.setInterval(() => {
      cellsRef.current.forEach((cell, index) => {
        if (!cell || Math.random() > effectiveFlickerChance) return;
        const baseOpacity = cells[index]?.opacity ?? 0;
        const pulse = Math.random() > 0.82 ? 1.7 : 0.35 + Math.random() * 0.65;
        cell.setAttribute("opacity", String(Math.min(maxOpacity, baseOpacity * pulse)));
      });
    }, effectiveAnimationInterval);

    return () => window.clearInterval(interval);
  }, [effectiveAnimationInterval, effectiveFlickerChance, cells, isVisible, maxOpacity, reducedMotion]);

  return (
    <svg
      ref={containerRef}
      aria-hidden="true"
      className={cn("pointer-events-none absolute inset-0 h-full w-full", className)}
      preserveAspectRatio="none"
      viewBox={`0 0 ${size.width} ${size.height}`}
    >
      {cells.map((cell, index) => (
        <rect
          key={`${cell.x}-${cell.y}`}
          ref={(node) => {
            if (node) cellsRef.current[index] = node;
          }}
          x={cell.x}
          y={cell.y}
          width={squareSize}
          height={squareSize}
          fill={color}
          opacity={cell.opacity}
          rx="0.5"
          shapeRendering="crispEdges"
          style={{ transition: "opacity 220ms ease-out" }}
        />
      ))}
    </svg>
  );
}
