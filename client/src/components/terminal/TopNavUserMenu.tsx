import { useState } from "react";
import { ChevronDown, Download, LogOut, Stethoscope } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTerminalAuth } from "@/contexts/TerminalAuthContext";
import { useDesktopUpdateCheck, type ManualCheckFeedback } from "@/hooks/useDesktopUpdateCheck";
import { isDesktopApp } from "@/lib/desktopRuntime";
import { appVersion } from "@/lib/appVersion";
import { DesktopSystemDiagnosticsModal } from "@/components/desktop/DesktopSystemDiagnosticsModal";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function manualCheckFeedbackLabel(feedback: ManualCheckFeedback): string | null {
  switch (feedback) {
    case "checking":
      return "Checking...";
    case "up_to_date":
      return "Up to date";
    case "update_available":
      return "Update available";
    case "error":
      return "Error checking update";
    default:
      return null;
  }
}

export function TopNavUserMenu() {
  const { saasDisabled, user, access, authenticated, logout } = useTerminalAuth();
  const desktopUpdate = useDesktopUpdateCheck();
  const [menuOpen, setMenuOpen] = useState(false);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);

  const planLabel = access?.subscription?.planName ?? (authenticated ? "ACTIVE" : "SIGNED OUT");
  const checkFeedback = manualCheckFeedbackLabel(desktopUpdate.manualCheckFeedback);

  if (saasDisabled || !user) {
    return (
      <button
        type="button"
        disabled
        className="inline-flex items-center gap-1 rounded-md border border-terminal-border/60 bg-terminal-panel/40 px-2.5 py-1 text-[11px] font-medium tracking-wide text-terminal-muted cursor-not-allowed"
        title="Account unavailable"
      >
        My Account
        <ChevronDown className="h-3 w-3 opacity-50" />
      </button>
    );
  }

  return (
    <>
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-md border border-terminal-border bg-terminal-panel/70 px-2.5 py-1 text-[11px] font-medium tracking-wide text-white/90 hover:border-terminal-accent/40 hover:bg-terminal-panel hover:text-white transition-colors"
            data-testid="button-user-menu"
          >
            My Account
            <ChevronDown className="h-3 w-3 text-terminal-muted" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="w-64 border-terminal-border bg-terminal-panel text-terminal-text font-mono text-xs"
        >
          <DropdownMenuLabel className="font-normal space-y-1 px-2 py-2">
            <div className="text-[10px] uppercase tracking-widest text-terminal-muted">My Account</div>
            <div className="truncate text-[11px] text-white" title={user.email}>
              {user.email}
            </div>
            <div className="flex items-center gap-2 text-[10px] text-terminal-muted uppercase tracking-wide">
              <span>{planLabel}</span>
              {user.role === "admin" && (
                <span className="rounded border border-terminal-accent/40 px-1 py-0.5 text-terminal-accent">
                  Admin
                </span>
              )}
            </div>
            <div className="text-[10px] text-slate-500">Desktop v{appVersion}</div>
          </DropdownMenuLabel>

          <DropdownMenuSeparator className="bg-terminal-border" />

          {isDesktopApp() && (
            <DropdownMenuItem
              className="cursor-pointer focus:bg-terminal-bg focus:text-white"
              onSelect={(event) => {
                event.preventDefault();
                void desktopUpdate.checkManually();
              }}
            >
              <Download className="mr-2 h-3.5 w-3.5" />
              <span className="flex-1">Check for updates</span>
              {checkFeedback ? (
                <span
                  className={cn(
                    "text-[9px] uppercase tracking-wide",
                    desktopUpdate.manualCheckFeedback === "error"
                      ? "text-red-300"
                      : desktopUpdate.manualCheckFeedback === "update_available"
                        ? "text-amber-300"
                        : desktopUpdate.manualCheckFeedback === "up_to_date"
                          ? "text-emerald-400"
                          : "text-terminal-muted",
                  )}
                >
                  {checkFeedback}
                </span>
              ) : null}
            </DropdownMenuItem>
          )}

          <DropdownMenuItem
            className="cursor-pointer focus:bg-terminal-bg focus:text-white"
            onSelect={() => {
              setMenuOpen(false);
              setDiagnosticsOpen(true);
            }}
          >
            <Stethoscope className="mr-2 h-3.5 w-3.5" />
            System diagnostics
          </DropdownMenuItem>

          <DropdownMenuSeparator className="bg-terminal-border" />

          <DropdownMenuItem
            className="cursor-pointer text-red-300 focus:bg-terminal-bg focus:text-red-200"
            onSelect={() => logout()}
          >
            <LogOut className="mr-2 h-3.5 w-3.5" />
            Log out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <DesktopSystemDiagnosticsModal open={diagnosticsOpen} onOpenChange={setDiagnosticsOpen} />
    </>
  );
}
