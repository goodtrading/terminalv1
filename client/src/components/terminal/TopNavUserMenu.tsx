import { Link } from "wouter";
import { ChevronDown, Download, LogOut, Settings2, Stethoscope, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLearnMode } from "@/hooks/useLearnMode";
import { useTerminalAuth } from "@/contexts/TerminalAuthContext";
import { useDesktopUpdateCheck } from "@/hooks/useDesktopUpdateCheck";
import { isDesktopApp } from "@/lib/desktopRuntime";
import { openSystemHealthPanel } from "@/lib/openSystemHealthPanel";
import { appVersion } from "@/lib/appVersion";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function TopNavUserMenu() {
  const { learnMode, toggleLearnMode } = useLearnMode();
  const { saasDisabled, user, access, authenticated, logout } = useTerminalAuth();
  const desktopUpdate = useDesktopUpdateCheck();
  const planLabel = access?.subscription?.planName ?? (authenticated ? "ACTIVE" : "SIGNED OUT");
  const updateAvailable =
    desktopUpdate.update.updateStatus === "optional_update" ||
    desktopUpdate.update.updateStatus === "required_update";

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
    <DropdownMenu>
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
          <div className="text-[10px] text-slate-500">v{appVersion}</div>
        </DropdownMenuLabel>

        <DropdownMenuSeparator className="bg-terminal-border" />

        <DropdownMenuItem
          disabled
          className="cursor-not-allowed opacity-60 focus:bg-terminal-bg"
          title="Próximamente"
        >
          <UserRound className="mr-2 h-3.5 w-3.5" />
          Mi cuenta
        </DropdownMenuItem>

        {user.role === "admin" && (
          <DropdownMenuItem asChild className="cursor-pointer focus:bg-terminal-bg focus:text-white">
            <Link href="/admin" className="w-full">
              Admin panel
            </Link>
          </DropdownMenuItem>
        )}

        <DropdownMenuCheckboxItem
          checked={learnMode}
          onCheckedChange={() => toggleLearnMode()}
          className="cursor-pointer focus:bg-terminal-bg focus:text-white"
        >
          <Settings2 className="mr-2 h-3.5 w-3.5" />
          Learn mode
        </DropdownMenuCheckboxItem>

        <DropdownMenuItem
          className="cursor-pointer focus:bg-terminal-bg focus:text-white"
          onSelect={() => openSystemHealthPanel()}
        >
          <Stethoscope className="mr-2 h-3.5 w-3.5" />
          Diagnóstico
        </DropdownMenuItem>

        {isDesktopApp() && (
          <DropdownMenuItem
            className={cn(
              "cursor-pointer focus:bg-terminal-bg focus:text-white",
              updateAvailable && "text-amber-300",
            )}
            onSelect={(event) => {
              event.preventDefault();
              void desktopUpdate.checkNow();
            }}
          >
            <Download className="mr-2 h-3.5 w-3.5" />
            Buscar actualización
            {updateAvailable && desktopUpdate.update.latestVersion
              ? ` (v${desktopUpdate.update.latestVersion})`
              : ""}
          </DropdownMenuItem>
        )}

        <DropdownMenuSeparator className="bg-terminal-border" />

        <DropdownMenuItem
          className="cursor-pointer text-red-300 focus:bg-terminal-bg focus:text-red-200"
          onSelect={() => logout()}
        >
          <LogOut className="mr-2 h-3.5 w-3.5" />
          Cerrar sesión
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
