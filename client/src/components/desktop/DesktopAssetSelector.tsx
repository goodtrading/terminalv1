import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { writeDesktopLog } from "@/lib/desktopStorage";
import {
  ACTIVE_DESKTOP_ASSET_ID,
  DESKTOP_ASSET_CATALOG,
  getActiveDesktopAsset,
} from "@/lib/desktopAssetCatalog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function DesktopAssetSelector() {
  const [open, setOpen] = useState(false);
  const activeAsset = getActiveDesktopAsset();

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) {
      void writeDesktopLog("desktop_asset_selector_opened");
    }
  };

  const handleAssetClick = (assetId: string, comingSoon?: boolean) => {
    if (comingSoon || assetId !== ACTIVE_DESKTOP_ASSET_ID) {
      void writeDesktopLog("desktop_asset_coming_soon_click", { assetId });
      return;
    }
    setOpen(false);
  };

  return (
    <DropdownMenu open={open} onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-sm border border-terminal-border/70 bg-terminal-panel/50 px-2 py-0.5 text-[10px] font-mono hover:border-terminal-accent/35 hover:bg-terminal-panel/80 transition-colors"
          data-testid="desktop-asset-selector"
        >
          <span className="text-terminal-muted uppercase tracking-wide">Asset:</span>
          <span className="text-white font-semibold">{activeAsset.label}</span>
          <ChevronDown className="h-3 w-3 text-terminal-muted" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="w-52 border-terminal-border bg-terminal-panel text-terminal-text font-mono text-xs"
      >
        <DropdownMenuLabel className="text-[9px] uppercase tracking-widest text-terminal-muted">
          Select asset
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="bg-terminal-border" />
        {DESKTOP_ASSET_CATALOG.map((asset) => {
          const isActive = asset.id === ACTIVE_DESKTOP_ASSET_ID;
          const disabled = !asset.enabled || asset.comingSoon;

          return (
            <DropdownMenuItem
              key={asset.id}
              disabled={false}
              onSelect={(event) => {
                event.preventDefault();
                handleAssetClick(asset.id, asset.comingSoon);
              }}
              className={cn(
                "flex items-center justify-between gap-2 text-[10px] focus:bg-white/5 cursor-default",
                isActive && "bg-terminal-accent/10",
                disabled && "opacity-60",
              )}
            >
              <span className={cn("font-semibold", isActive ? "text-terminal-accent" : "text-white/80")}>
                {asset.label}
              </span>
              <span
                className={cn(
                  "text-[8px] uppercase tracking-wide",
                  isActive ? "text-terminal-accent" : "text-terminal-muted",
                )}
              >
                {isActive ? "Active" : asset.comingSoon ? "Próximamente" : "—"}
              </span>
            </DropdownMenuItem>
          );
        })}
        <DropdownMenuSeparator className="bg-terminal-border" />
        <div className="px-2 py-1.5 text-[8px] text-terminal-muted leading-snug">
          More assets coming soon
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
