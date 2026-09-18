import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion";
import { cn } from "@/lib/utils";

type ContainerScrollAnimationProps = {
  children: ReactNode;
  className?: string;
};

type ViewportProfile = "desktop" | "tablet" | "mobile";

type MotionProfile = {
  scale: number;
  rotateX: number;
  translateY: number;
  opacity: number;
};

const BREAKOUT_CLASSES =
  "sm:max-lg:relative sm:max-lg:left-1/2 sm:max-lg:w-[92vw] sm:max-lg:-translate-x-1/2 lg:relative lg:left-1/2 lg:w-[94vw] lg:max-w-[1440px] lg:-translate-x-1/2";

const MOTION_PROFILES: Record<ViewportProfile, MotionProfile> = {
  desktop: { scale: 0.82, rotateX: 5, translateY: 70, opacity: 0.9 },
  tablet: { scale: 0.93, rotateX: 3, translateY: 44, opacity: 0.92 },
  mobile: { scale: 0.96, rotateX: 1.5, translateY: 20, opacity: 0.94 },
};

function getViewportProfile(): ViewportProfile {
  if (typeof window === "undefined" || window.innerWidth < 640) return "mobile";
  if (window.innerWidth < 1024) return "tablet";
  return "desktop";
}

function useViewportProfile() {
  const [profile, setProfile] = useState<ViewportProfile>(getViewportProfile);

  useEffect(() => {
    const updateProfile = () => setProfile(getViewportProfile());
    window.addEventListener("resize", updateProfile);
    return () => window.removeEventListener("resize", updateProfile);
  }, []);

  return profile;
}

function ContainerScrollStatic({ children, className }: ContainerScrollAnimationProps) {
  return (
    <div className={cn("w-full", BREAKOUT_CLASSES, className)} style={{ perspective: "1200px" }}>
      <div className="w-full">{children}</div>
    </div>
  );
}

function ContainerScrollMotion({ children, className }: ContainerScrollAnimationProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const profile = useViewportProfile();
  const motionProfile = useMemo(() => MOTION_PROFILES[profile], [profile]);
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start 0.88", "start 0.32"],
  });
  const scale = useTransform(scrollYProgress, [0, 1], [motionProfile.scale, 1]);
  const rotateX = useTransform(scrollYProgress, [0, 1], [motionProfile.rotateX, 0]);
  const translateY = useTransform(scrollYProgress, [0, 1], [motionProfile.translateY, 0]);
  const opacity = useTransform(scrollYProgress, [0, 1], [motionProfile.opacity, 1]);

  return (
    <div ref={containerRef} className={cn("w-full", BREAKOUT_CLASSES, className)} style={{ perspective: "1200px" }}>
      <motion.div
        className="w-full"
        style={{
          scale,
          rotateX,
          y: translateY,
          opacity,
          transformOrigin: "center top",
          transformStyle: "preserve-3d",
        }}
      >
        {children}
      </motion.div>
    </div>
  );
}

export function ContainerScrollAnimation(props: ContainerScrollAnimationProps) {
  const reducedMotion = useReducedMotion();

  if (reducedMotion) return <ContainerScrollStatic {...props} />;
  return <ContainerScrollMotion {...props} />;
}
