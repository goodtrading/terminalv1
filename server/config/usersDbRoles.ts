/** Hardcoded literals for `users.role` — must match `users_role_check` (lowercase). Env ignored until constraint is stable. */
export function getUsersDbRoleUser(): string {
  return "user";
}

export function getUsersDbRoleAdmin(): string {
  return "admin";
}
