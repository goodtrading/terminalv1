import type { PointerEvent, ReactNode } from "react";
import { cn } from "@/lib/utils";

type CardSpotlightProps = {
  children: ReactNode;
  className?: string;
};

function supportsFinePointer() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(hover: hover) and (pointer: fine)").matches &&
    !window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function updateSpotlightPosition(event: PointerEvent<HTMLDivElement>) {
  const card = event.currentTarget;
  const bounds = card.getBoundingClientRect();
  card.style.setProperty("--card-spotlight-x", `${event.clientX - bounds.left}px`);
  card.style.setProperty("--card-spotlight-y", `${event.clientY - bounds.top}px`);
}

export function CardSpotlight({ children, className }: CardSpotlightProps) {
  const handlePointerEnter = (event: PointerEvent<HTMLDivElement>) => {
    if (!supportsFinePointer()) return;
    event.currentTarget.dataset.spotlightActive = "true";
    updateSpotlightPosition(event);
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.dataset.spotlightActive !== "true") return;
    updateSpotlightPosition(event);
  };

  const handlePointerLeave = (event: PointerEvent<HTMLDivElement>) => {
    delete event.currentTarget.dataset.spotlightActive;
  };

  return (
    <div
      className={cn("card-spotlight relative isolate overflow-hidden rounded-[16px]", className)}
      onPointerEnter={handlePointerEnter}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
    >
      {children}
    </div>
  );
}
