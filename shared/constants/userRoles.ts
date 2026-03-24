/**
 * Roles stored in PostgreSQL `users.role` must satisfy `users_role_check`.
 * Defaults match common CHECK (role IN ('USER','ADMIN')).
 * Override with USERS_DB_ROLE_USER / USERS_DB_ROLE_ADMIN on the server if your constraint differs.
 */
export const USERS_DB_ROLE_USER_DEFAULT = "USER";
export const USERS_DB_ROLE_ADMIN_DEFAULT = "ADMIN";

/** Stable API + JWT surface for clients (lowercase). */
export const API_ROLE_USER = "user";
export const API_ROLE_ADMIN = "admin";
