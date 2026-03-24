/**
 * Crea tablas SaaS/auth. Tabla principal: users (alineada con Neon).
 * Uso: npm run db:push:saas
 */
import "dotenv/config";
import pg from "pg";

const DDL = `
CREATE TABLE IF NOT EXISTS users (
  id serial PRIMARY KEY,
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  full_name text,
  role text NOT NULL DEFAULT 'user',
  status text NOT NULL DEFAULT 'pending',
  created_at timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS saas_subscription_plans (
  id serial PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  price_usd double precision NOT NULL,
  duration_days integer NOT NULL,
  paypal_link text,
  usdt_address text,
  sort_order integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS saas_subscriptions (
  id serial PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id),
  plan_id integer NOT NULL REFERENCES saas_subscription_plans(id),
  status text NOT NULL,
  starts_at timestamp NOT NULL,
  ends_at timestamp NOT NULL,
  created_at timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS saas_payments (
  id serial PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id),
  amount_usd double precision NOT NULL,
  method text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  external_ref text,
  notes text,
  created_at timestamp DEFAULT now() NOT NULL
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS full_name text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS status text;
UPDATE users SET status = 'pending' WHERE status IS NULL;
ALTER TABLE users ALTER COLUMN status SET DEFAULT 'pending';
`;

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set in .env");
  }
  const pool = new pg.Pool({ connectionString: url });
  try {
    await pool.query(DDL);
    console.log(
      "[apply-saas-tables] OK: users, saas_subscription_plans, saas_subscriptions, saas_payments (IF NOT EXISTS)",
    );
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error("[apply-saas-tables] FAILED:", e);
  process.exit(1);
});
