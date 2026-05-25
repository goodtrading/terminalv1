import type { OverlayEntry, OverlayRenderContext } from "../types";

/**
 * Short Gamma Pockets Overlay Renderer
 * Renders bands for active/watch short gamma pockets on the chart
 */
export function renderShortGammaPockets(context: OverlayRenderContext): OverlayEntry[] {
  const entries: OverlayEntry[] = [];
  
  // Get short gamma pockets from terminal state (via options or positioning)
  const shortGammaPockets = context.options?.shortGammaPockets;
  
  if (!shortGammaPockets) {
    return entries;
  }
  
  const { status, nearest } = shortGammaPockets;
  
  // Only render if status is WATCH, ACTIVE, or EXPANDING
  if (status === "NONE" || status === "IDLE" || !nearest) {
    return entries;
  }
  
  // Determine color based on status
  let color = "rgba(255, 100, 100, 0.15)"; // Default red for ACTIVE
  let label = "SHORT GAMMA POCKET — ACTIVE";
  
  if (status === "WATCH") {
    color = "rgba(255, 165, 0, 0.12)"; // Orange for WATCH
    label = "SHORT GAMMA POCKET — WATCH";
  } else if (status === "EXPANDING") {
    color = "rgba(200, 100, 255, 0.18)"; // Purple for EXPANDING
    label = "SHORT GAMMA POCKET — EXPANDING";
  }
  
  // Create band entry for the pocket range
  const bandEntry: OverlayEntry = {
    price: nearest.rangeLow,
    priority: 3,
    label: label,
    shortLabel: "SGP",
    color: color,
    style: 2, // Dashed line style
    width: 1,
    axisLabel: true,
    isBandFill: true,
  };
  
  entries.push(bandEntry);
  
  // Add a second entry for the upper bound of the band
  const upperBoundEntry: OverlayEntry = {
    price: nearest.rangeHigh,
    priority: 3,
    label: "",
    shortLabel: "",
    color: color,
    style: 2,
    width: 1,
    axisLabel: false,
    isBandFill: true,
  };
  
  entries.push(upperBoundEntry);
  
  return entries;
}
