/**
 * Roles stored in PostgreSQL `users.role` must satisfy `users_role_check`.
 * Persisted literals are defined in `server/config/usersDbRoles.ts` (lowercase).
 */
export const USERS_DB_ROLE_USER_DEFAULT = "user";
export const USERS_DB_ROLE_ADMIN_DEFAULT = "admin";

/** Stable API + JWT surface for clients (same strings as DB defaults). */
export const API_ROLE_USER = "user";
export const API_ROLE_ADMIN = "admin";
