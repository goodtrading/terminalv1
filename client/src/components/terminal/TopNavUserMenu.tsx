import { Link } from "wouter";
import { ChevronDown, Download, LogOut, Settings2, Stethoscope } from "lucide-react";
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
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

function userInitials(email: string | undefined): string {
  if (!email) return "GT";
  const local = email.split("@")[0]?.trim() ?? "";
  if (!local) return "GT";
  const parts = local.split(/[._-]+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
  }
  return local.slice(0, 2).toUpperCase();
}

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
      <span className="text-[10px] font-mono text-terminal-muted uppercase tracking-wider">
        {authenticated ? planLabel : "Guest"}
      </span>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-md border border-terminal-border bg-terminal-panel/70 px-1.5 py-1 text-left hover:border-terminal-accent/40 hover:bg-terminal-panel transition-colors"
          data-testid="button-user-menu"
        >
          <Avatar className="h-6 w-6 border border-terminal-border/60">
            <AvatarFallback className="bg-terminal-bg text-[10px] font-bold text-terminal-accent">
              {userInitials(user.email)}
            </AvatarFallback>
          </Avatar>
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

        {user.role === "admin" && (
          <>
            <DropdownMenuItem asChild className="cursor-pointer focus:bg-terminal-bg focus:text-white">
              <Link href="/admin" className="w-full">
                Admin panel
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator className="bg-terminal-border" />
          </>
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
          System / Diagnóstico
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
