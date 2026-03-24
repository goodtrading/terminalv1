import { cn } from "@/lib/utils";

const TRACK_WIDTH = 36;
const TRACK_HEIGHT = 20;
const THUMB_SIZE = 14;
const INNER_PADDING = 3;
const THUMB_TRAVEL = TRACK_WIDTH - THUMB_SIZE - INNER_PADDING * 2;

interface SwitchProps {
  checked: boolean;
  onCheckedChange: (value: boolean) => void;
  disabled?: boolean;
  className?: string;
}

export function Switch({ checked, onCheckedChange, disabled = false, className }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-disabled={disabled}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "relative rounded-full border transition-all duration-200 ease-out",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/55 focus-visible:ring-offset-1 focus-visible:ring-offset-[#0b0d12]",
        "hover:shadow-[0_0_0_1px_rgba(255,255,255,0.08)]",
        checked
          ? "bg-red-600/75 border-red-500/80 shadow-[0_0_12px_rgba(220,38,38,0.18)]"
          : "bg-[#10141c] border-white/20",
        disabled && "opacity-50 cursor-not-allowed hover:shadow-none",
        className
      )}
      style={{ width: TRACK_WIDTH, height: TRACK_HEIGHT }}
    >
      <span
        className={cn(
          "absolute left-0 rounded-full bg-[#f8fafc] transition-all duration-200 ease-out",
          disabled && "bg-[#d1d5db]"
        )}
        style={{
          width: THUMB_SIZE,
          height: THUMB_SIZE,
          top: "50%",
          transform: checked
            ? `translateX(${THUMB_TRAVEL}px) translateY(-50%)`
            : `translateX(${INNER_PADDING}px) translateY(-50%)`,
        }}
      />
    </button>
  );
}

