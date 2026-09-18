import { cn } from "@/lib/utils";
import { useLocation } from "wouter";
import { useMarketingCta } from "@/hooks/useMarketingCta";
import { openDesktopDownload } from "@/lib/downloadDesktop";
import { PremiumShimmer } from "./PremiumShimmer";

type DynamicCtaButtonsProps = {
  className?: string;
  size?: "default" | "large";
  source: string;
  shimmerPrimary?: boolean;
};

export function DynamicCtaButtons({
  className,
  size = "default",
  source,
  shimmerPrimary = false,
}: DynamicCtaButtonsProps) {
  const [, setLocation] = useLocation();
  const {
    primaryLabel,
    primaryTarget,
    primaryAction,
    secondaryLabel,
    secondaryTarget,
    secondaryAction,
  } = useMarketingCta();

  const btnBase =
    size === "large"
      ? "rounded-xl px-8 py-3.5 text-sm font-semibold"
      : "rounded-xl px-6 py-3 text-sm font-semibold";

  const run = (action: typeof primaryAction, target: string) => {
    if (action === "download") openDesktopDownload(source);
    else setLocation(target);
  };

  return (
    <div className={cn("flex flex-wrap gap-4", className)}>
      <button
        type="button"
        onClick={() => run(primaryAction, primaryTarget)}
        className={cn(
          btnBase,
          shimmerPrimary && "relative isolate overflow-hidden",
          "marketing-focus-ring marketing-motion-colors bg-gradient-to-r from-[#b81523] via-[#ff303c] to-[#b81523] text-white shadow-[0_0_28px_rgba(255,48,60,0.20)] hover:opacity-90",
        )}
      >
        {shimmerPrimary ? (
          <>
            <PremiumShimmer />
            <span className="relative z-10">{primaryLabel}</span>
          </>
        ) : (
          primaryLabel
        )}
      </button>
      <button
        type="button"
        onClick={() => run(secondaryAction, secondaryTarget)}
        className={cn(
          btnBase,
          "marketing-focus-ring marketing-motion-colors border border-white/18 bg-white/[0.05] text-white hover:border-white/28 hover:bg-white/10",
        )}
      >
        {secondaryLabel}
      </button>
    </div>
  );
}
