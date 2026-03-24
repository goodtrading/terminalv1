/**
 * Values written to `users.role`. Must match `users_role_check` in Postgres.
 * API/JWT stay on `user` / `admin`; env only overrides the persisted literal if your DB differs.
 */
export function getUsersDbRoleUser(): string {
  return process.env.USERS_DB_ROLE_USER?.trim() || "user";
}

export function getUsersDbRoleAdmin(): string {
  return process.env.USERS_DB_ROLE_ADMIN?.trim() || "admin";
}
