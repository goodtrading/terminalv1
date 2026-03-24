# SaaS, auth y `DATABASE_URL`

## Tablas en Postgres

Auth y perfil viven en **`users`**. Planes y suscripciones usan prefijo `saas_` en el nombre de tabla, pero **`user_id` siempre referencia `users.id`** (no existe `saas_users` en el código).

| Tabla Drizzle | Nombre en DB |
|---------------|----------------|
| `users` | `users` |
| `subscriptionPlans` | `saas_subscription_plans` |
| `subscriptions` | `saas_subscriptions` (`user_id` → `users.id`) |
| `payments` | `saas_payments` (`user_id` → `users.id`) |

### FK antigua apuntando a `saas_users`

Si Postgres devuelve error del tipo `Key (user_id) is not present in table "saas_users"`, la FK en `saas_subscriptions` (y a veces `saas_payments`) sigue referenciando una tabla equivocada. Corregir:

```bash
npm run db:fix:saas-fk-users
```

O ejecutar manualmente `scripts/sql/repoint_saas_subscriptions_user_id_to_users.sql` en Neon/psql.

### Aplicar solo DDL SaaS (sin prompts de renombre)

```bash
npm run db:push:saas
```

Ejecuta `scripts/apply-saas-tables.ts` (`CREATE TABLE IF NOT EXISTS` para las cuatro tablas anteriores).  
El `drizzle-kit push` **completo** (`npm run db:push`) puede pedir confirmación interactiva si hay tablas antiguas con nombres parecidos; para **solo** auth/SaaS usa `db:push:saas`.

## Comportamiento

| `DATABASE_URL` en `.env` | Servidor | Frontend |
|--------------------------|----------|----------|
| **Vacío / ausente** | No se registran rutas reales de SaaS (`registerSaasRoutes`). Se usan **stubs**: `GET /api/auth/me` y `GET /api/plans` devuelven JSON con `saasDisabled: true`. El resto de rutas SaaS responden **503** `SAAS_NOT_CONFIGURED`. | `TerminalAuthContext` recibe `saasDisabled: true` → **`BlockedAccessScreen`** muestra **AUTH SERVICE UNAVAILABLE** (no formulario de login). |
| **Definido y DB migrada** | Se cargan `saasRoutes`, job `expireSubscriptions`, tablas Drizzle. | Tras `/api/auth/me` sin `saasDisabled`, aparece **login/registro** → terminal si `access.allowed`. |

## Por qué no ves login sin base de datos

1. Sin `DATABASE_URL`, `GET /api/auth/me` devuelve `saasDisabled: true`.
2. **`BlockedAccessScreen`** evalúa primero `saasDisabled` y muestra la pantalla de servicio no disponible; **no** llega a la rama del formulario de login.
3. No es un bug del formulario: **auth SaaS no se activa** hasta que el servidor tenga Postgres y las rutas reales.

## Rutas API que dependen de `DATABASE_URL`

Solo existen **implementadas** cuando `DATABASE_URL` está configurado y `npm run db:push` ha creado tablas:

| Método | Ruta | Uso |
|--------|------|-----|
| GET | `/api/plans` | Planes de suscripción |
| POST | `/api/auth/register` | Registro |
| POST | `/api/auth/login` | Login |
| GET | `/api/auth/me` | Sesión (también stub sin DB) |
| GET | `/api/auth/access` | Estado de acceso |
| POST | `/api/payments/report` | Reporte de pago |
| GET | `/api/admin/users` | Lista admin |
| PATCH | `/api/admin/users/:id` | Rol / activo |
| POST | `/api/admin/users/:id/subscription` | Otorgar suscripción |

Sin DB: `GET /api/auth/me` y `GET /api/plans` responden 200 con `saasDisabled`; el resto → **503**.

## Componentes frontend que dependen de auth/SaaS

| Componente / ruta | Depende de |
|-------------------|------------|
| `BlockedAccessScreen` | `saasDisabled`, `user`, `access` |
| `SubscriptionPage` | Usuario logueado, `/api/plans` |
| `pages/admin/AdminPage` | Rol admin + APIs admin |
| `TopNav` | `!saasDisabled && user` → email, ADMIN, LOG OUT |
| `TradingPlan` | `saasDisabled` / `access.subscription` para aviso de caducidad |
| `TerminalAuthContext` | `/api/auth/me` |

## `users.role` y `users_role_check`

En Postgres suele existir un `CHECK` (p. ej. `user` y `admin` en minúsculas). El servidor persiste **`user` / `admin`** por defecto (`getUsersDbRoleUser` / `getUsersDbRoleAdmin`). La API y el JWT usan los mismos literales.

Los valores persistidos son fijos en código (`user` / `admin`) vía `server/config/usersDbRoles.ts` (sin leer env por ahora).

## Checklist con DB real

1. En `.env`: `DATABASE_URL=postgresql://...` (Neon: **Connection string → URI**, `sslmode=require`).
2. `npm run db:push`
3. Reiniciar `npm run dev`
4. Probar: registro → login → si no hay sub, pantalla de suscripción → admin (si aplica).
