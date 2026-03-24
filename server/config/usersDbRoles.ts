import {
  USERS_DB_ROLE_ADMIN_DEFAULT,
  USERS_DB_ROLE_USER_DEFAULT,
} from "@shared/constants/userRoles";

/** Effective DB string for a normal user row — must match `users_role_check`. */
export function getUsersDbRoleUser(): string {
  const v = process.env.USERS_DB_ROLE_USER?.trim();
  return v && v.length > 0 ? v : USERS_DB_ROLE_USER_DEFAULT;
}

/** Effective DB string for an admin row — must match `users_role_check`. */
export function getUsersDbRoleAdmin(): string {
  const v = process.env.USERS_DB_ROLE_ADMIN?.trim();
  return v && v.length > 0 ? v : USERS_DB_ROLE_ADMIN_DEFAULT;
}
