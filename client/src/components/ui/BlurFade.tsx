import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";

type BlurFadeProps = {
  children: ReactNode;
  className?: string;
  delay?: number;
  duration?: number;
};

type BlurFadeStyle = CSSProperties & {
  "--blur-fade-delay"?: string;
  "--blur-fade-duration"?: string;
};

export function BlurFade({ children, className, delay = 0, duration = 550 }: BlurFadeProps) {
  const style: BlurFadeStyle = {
    "--blur-fade-delay": `${delay}ms`,
    "--blur-fade-duration": `${duration}ms`,
  };

  return (
    <div className={cn("blur-fade-in", className)} style={style}>
      {children}
    </div>
  );
}
