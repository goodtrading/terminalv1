import { API_ROLE_ADMIN, API_ROLE_USER } from "@shared/constants/userRoles";
import { getUsersDbRoleAdmin, getUsersDbRoleUser } from "../config/usersDbRoles";

/** True if DB (or legacy) role represents an admin. */
export function isAdminRole(role: string | null | undefined): boolean {
  if (!role) return false;
  if (role === API_ROLE_ADMIN) return true;
  const dbAdmin = getUsersDbRoleAdmin();
  return role === dbAdmin || role.toLowerCase() === API_ROLE_ADMIN;
}

/** Map API / service input to the exact string persisted in `users.role`. */
export function apiRoleToDbRole(api: "user" | "admin"): string {
  return api === "admin" ? getUsersDbRoleAdmin() : getUsersDbRoleUser();
}

/** Map stored `users.role` to the API / JWT shape (`user` | `admin`). */
export function dbRoleToApiRole(db: string): "user" | "admin" {
  return isAdminRole(db) ? API_ROLE_ADMIN : API_ROLE_USER;
}
