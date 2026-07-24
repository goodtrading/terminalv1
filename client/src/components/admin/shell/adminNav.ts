import type { LucideIcon } from "lucide-react";
import {
  Beaker,
  Crosshair,
  Fingerprint,
  FlaskConical,
  GitBranch,
  HeartPulse,
  History,
  Inbox,
  Network,
  Users,
  Workflow,
} from "lucide-react";

export type AdminNavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** When true, active only on exact path match (always used; /admin never prefix-matches). */
  exact: true;
};

export type AdminNavGroup = {
  id: string;
  label: string;
  items: AdminNavItem[];
};

/**
 * Admin sidebar groups. Routes must match AppRouter exactly.
 * "Estado del sistema" omitted — no dedicated route.
 */
export const ADMIN_NAV_GROUPS: AdminNavGroup[] = [
  {
    id: "general",
    label: "GENERAL",
    items: [
      { href: "/admin", label: "Usuarios", icon: Users, exact: true },
    ],
  },
  {
    id: "ia-conocimiento",
    label: "IA Y CONOCIMIENTO",
    items: [
      { href: "/admin/ai-lab", label: "AI Lab", icon: FlaskConical, exact: true },
      { href: "/admin/knowledge-inbox", label: "Knowledge Inbox", icon: Inbox, exact: true },
      { href: "/admin/knowledge-health", label: "Knowledge Health", icon: HeartPulse, exact: true },
      {
        href: "/admin/human-methodology-review",
        label: "Human Methodology Review",
        icon: Beaker,
        exact: true,
      },
    ],
  },
  {
    id: "mercado-modelos",
    label: "MERCADO Y MODELOS",
    items: [
      { href: "/admin/market-snapshot", label: "Market Snapshot", icon: Crosshair, exact: true },
      { href: "/admin/decision-graph", label: "Decision Graph", icon: Network, exact: true },
      {
        href: "/admin/critical-calibration",
        label: "Critical Calibration",
        icon: Workflow,
        exact: true,
      },
    ],
  },
  {
    id: "evolucion",
    label: "EVOLUCIÓN",
    items: [
      {
        href: "/admin/knowledge-distillation",
        label: "Knowledge Distillation",
        icon: GitBranch,
        exact: true,
      },
      {
        href: "/admin/knowledge-evolution",
        label: "Knowledge Evolution",
        icon: History,
        exact: true,
      },
      {
        href: "/admin/knowledge-provenance",
        label: "Knowledge Provenance",
        icon: Fingerprint,
        exact: true,
      },
    ],
  },
];

export function normalizeAdminPath(pathname: string): string {
  if (!pathname) return "/";
  if (pathname.length > 1 && pathname.endsWith("/")) {
    return pathname.slice(0, -1);
  }
  return pathname;
}

/**
 * Active matching:
 * - `/admin` is active ONLY on exact `/admin` (never on `/admin/...` children)
 * - every other item uses exact path match
 */
export function isAdminNavActive(href: string, pathname: string): boolean {
  const path = normalizeAdminPath(pathname);
  const target = normalizeAdminPath(href);
  if (target === "/admin") {
    return path === "/admin";
  }
  return path === target;
}

export function flattenAdminNavItems(): AdminNavItem[] {
  return ADMIN_NAV_GROUPS.flatMap((g) => g.items);
}
