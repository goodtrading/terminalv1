import type { CSSProperties, ReactNode } from "react";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

type TextRevealProps = {
  children: ReactNode;
  className?: string;
  inactiveOpacity?: number;
};

type TextRevealStyle = CSSProperties & {
  "--text-reveal-opacity"?: number;
};

const DEFAULT_INACTIVE_OPACITY = 0.24;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function easeOut(value: number) {
  return 1 - (1 - value) ** 3;
}

export function TextReveal({ children, className, inactiveOpacity = DEFAULT_INACTIVE_OPACITY }: TextRevealProps) {
  const rootRef = useRef<HTMLSpanElement>(null);
  const wordRefs = useRef<HTMLSpanElement[]>([]);
  const text = typeof children === "string" ? children : String(children);
  const words = text.trim().split(/\s+/);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    let frame: number | null = null;
    let reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const setProgress = (progress: number) => {
      const lastWordIndex = Math.max(1, words.length - 1);
      wordRefs.current.forEach((word, index) => {
        const revealStart = (index / lastWordIndex) * 0.82;
        const wordProgress = clamp((progress - revealStart) / 0.18, 0, 1);
        const opacity = inactiveOpacity + (1 - inactiveOpacity) * easeOut(wordProgress);
        word.style.setProperty("--text-reveal-opacity", String(opacity));
      });
    };

    const updateProgress = () => {
      frame = null;
      const rect = root.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const start = viewportHeight * 0.82;
      const end = viewportHeight * 0.3;
      setProgress(clamp((start - rect.top) / (start - end), 0, 1));
    };

    const scheduleUpdate = () => {
      if (frame !== null) return;
      frame = window.requestAnimationFrame(updateProgress);
    };

    const attachScroll = () => {
      window.addEventListener("scroll", scheduleUpdate, { passive: true });
      window.addEventListener("resize", scheduleUpdate);
      scheduleUpdate();
    };

    const detachScroll = () => {
      window.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
      if (frame !== null) {
        window.cancelAnimationFrame(frame);
        frame = null;
      }
    };

    const handleMotionPreference = (event: MediaQueryListEvent) => {
      reducedMotion = event.matches;
      if (reducedMotion) {
        detachScroll();
        setProgress(1);
      } else {
        attachScroll();
      }
    };

    if (reducedMotion) {
      setProgress(1);
    } else {
      attachScroll();
    }

    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    mediaQuery.addEventListener("change", handleMotionPreference);

    return () => {
      detachScroll();
      mediaQuery.removeEventListener("change", handleMotionPreference);
    };
  }, [inactiveOpacity, text]);

  return (
    <span ref={rootRef} className={cn("text-reveal-root", className)}>
      {words.map((word, index) => {
        const style: TextRevealStyle = { "--text-reveal-opacity": inactiveOpacity };
        return (
          <span
            key={`${word}-${index}`}
            ref={(node) => {
              if (node) wordRefs.current[index] = node;
            }}
            className="text-reveal-word"
            style={style}
          >
            {index > 0 ? " " : ""}
            {word}
          </span>
        );
      })}
    </span>
  );
}
