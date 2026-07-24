import { Link, useLocation } from "wouter";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ADMIN_NAV_GROUPS, isAdminNavActive } from "./adminNav";

type AdminSidebarProps = {
  mobileOpen?: boolean;
  onMobileOpenChange?: (open: boolean) => void;
};

function BrandBlock({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="space-y-3 border-b border-terminal-border px-4 py-4">
      <div className="flex items-center gap-3">
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm border border-terminal-accent/50 bg-terminal-panel text-[11px] font-bold tracking-wider text-terminal-accent"
          aria-hidden
        >
          GT
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-white">GoodTrading</div>
          <div className="text-[10px] uppercase tracking-[0.16em] text-terminal-muted">
            Administración
          </div>
        </div>
      </div>
      <Link
        href="/terminal"
        onClick={onNavigate}
        className="inline-flex items-center gap-1.5 text-[11px] font-mono text-terminal-muted transition-colors hover:text-terminal-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terminal-accent"
      >
        <ArrowLeft className="h-3 w-3" aria-hidden />
        Volver a la terminal
      </Link>
    </div>
  );
}

function NavBody({ onNavigate }: { onNavigate?: () => void }) {
  const [location] = useLocation();

  return (
    <nav className="flex-1 overflow-y-auto px-2 py-3" aria-label="Navegación de administración">
      {ADMIN_NAV_GROUPS.map((group) => (
        <div key={group.id} className="mb-4">
          <div className="px-2 pb-1.5 text-[10px] font-mono uppercase tracking-[0.14em] text-terminal-muted">
            {group.label}
          </div>
          <ul className="space-y-0.5">
            {group.items.map((item) => {
              const active = isAdminNavActive(item.href, location);
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "group flex items-center gap-2.5 rounded-sm px-2.5 py-2 text-[12px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terminal-accent",
                      active
                        ? "bg-terminal-accent/10 text-white"
                        : "text-terminal-muted hover:bg-terminal-panel hover:text-white",
                    )}
                  >
                    <Icon
                      className={cn(
                        "h-3.5 w-3.5 shrink-0",
                        active ? "text-terminal-accent" : "text-terminal-muted group-hover:text-white/80",
                      )}
                      aria-hidden
                    />
                    <span className="truncate leading-snug">{item.label}</span>
                    {active ? (
                      <span className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-terminal-accent" aria-hidden />
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function SidebarChrome({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="flex h-full flex-col bg-terminal-panel text-terminal-text">
      <BrandBlock onNavigate={onNavigate} />
      <NavBody onNavigate={onNavigate} />
    </div>
  );
}

export function AdminSidebar({ mobileOpen = false, onMobileOpenChange }: AdminSidebarProps) {
  const closeMobile = () => onMobileOpenChange?.(false);

  return (
    <>
      <aside
        className="sticky top-0 hidden h-screen w-[240px] shrink-0 border-r border-terminal-border lg:block"
        data-testid="admin-sidebar-desktop"
      >
        <SidebarChrome />
      </aside>

      <Sheet open={mobileOpen} onOpenChange={onMobileOpenChange}>
        <SheetContent
          side="left"
          className="w-[min(100%,280px)] border-terminal-border bg-terminal-panel p-0 text-terminal-text [&>button]:text-terminal-muted"
          data-testid="admin-sidebar-mobile"
        >
          <SheetHeader className="sr-only">
            <SheetTitle>Menú de administración</SheetTitle>
            <SheetDescription>Navegación del panel administrativo GoodTrading</SheetDescription>
          </SheetHeader>
          <SidebarChrome onNavigate={closeMobile} />
        </SheetContent>
      </Sheet>
    </>
  );
}
