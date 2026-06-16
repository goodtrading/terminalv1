import { cn } from "@/lib/utils";
import { useLocation } from "wouter";
import { useMarketingCta } from "@/hooks/useMarketingCta";
import { openDesktopDownload } from "@/lib/downloadDesktop";

type DynamicCtaButtonsProps = {
  className?: string;
  size?: "default" | "large";
  source: string;
};

export function DynamicCtaButtons({ className, size = "default", source }: DynamicCtaButtonsProps) {
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
          "bg-gradient-to-r from-[#ff3b3b] via-red-600 to-violet-700 text-white shadow-[0_0_36px_rgba(255,59,59,0.28)] transition-opacity hover:opacity-90",
        )}
      >
        {primaryLabel}
      </button>
      <button
        type="button"
        onClick={() => run(secondaryAction, secondaryTarget)}
        className={cn(
          btnBase,
          "border border-white/18 bg-white/[0.05] text-white transition-colors hover:border-white/28 hover:bg-white/10",
        )}
      >
        {secondaryLabel}
      </button>
    </div>
  );
}
