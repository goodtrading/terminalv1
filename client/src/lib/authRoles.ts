import type { AuthUser } from "@/contexts/TerminalAuthContext";

export function isAdminUser(user: AuthUser | null | undefined): boolean {
  if (!user) return false;
  const role = String(user.role ?? "").trim().toLowerCase();
  if (role === "admin") return true;
  return (user as AuthUser & { isAdmin?: boolean }).isAdmin === true;
}
