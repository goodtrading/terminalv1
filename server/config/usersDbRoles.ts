/** Literals for `users.role` — must match `users_role_check` (e.g. admin | member). API/JWT still use user | admin via userRoles mapping. */
export function getUsersDbRoleUser(): string {
  return "member";
}

export function getUsersDbRoleAdmin(): string {
  return "admin";
}
