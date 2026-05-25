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
  const logPrefix = "[apply-saas-tables]";
  console.log(logPrefix, "starting...");
  
  const url = process.env.DATABASE_URL;
  console.log(logPrefix, "DATABASE_URL present:", !!url);
  
  if (!url) {
    console.error(logPrefix, "DATABASE_URL is not set in .env");
    throw new Error("DATABASE_URL is not set in .env");
  }
  
  console.log(logPrefix, "creating DB pool...");
  const pool = new pg.Pool({ connectionString: url });
  
  try {
    // Test basic connection
    console.log(logPrefix, "testing DB connection with SELECT 1...");
    const testResult = await pool.query('SELECT 1');
    console.log(logPrefix, "DB connection test:", testResult.rows.length > 0 ? "OK" : "FAILED");
    
    // Execute DDL
    console.log(logPrefix, "executing DDL (CREATE TABLE IF NOT EXISTS)...");
    await pool.query(DDL);
    console.log(
      logPrefix,
      "OK: users, saas_subscription_plans, saas_subscriptions, saas_payments (IF NOT EXISTS)",
    );
    
    // Verification queries
    console.log(logPrefix, "running verification queries...");
    
    const usersCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'users'
      );
    `);
    console.log(logPrefix, "users table exists:", usersCheck.rows[0]?.exists === true);
    
    const plansCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'saas_subscription_plans'
      );
    `);
    console.log(logPrefix, "saas_subscription_plans table exists:", plansCheck.rows[0]?.exists === true);
    
    const subsCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'saas_subscriptions'
      );
    `);
    console.log(logPrefix, "saas_subscriptions table exists:", subsCheck.rows[0]?.exists === true);
    
    const paymentsCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'saas_payments'
      );
    `);
    console.log(logPrefix, "saas_payments table exists:", paymentsCheck.rows[0]?.exists === true);
    
    const usersCount = await pool.query('SELECT COUNT(*) as count FROM users');
    console.log(logPrefix, "users count:", usersCount.rows[0]?.count || '0');
    
    const plansCount = await pool.query('SELECT COUNT(*) as count FROM saas_subscription_plans');
    console.log(logPrefix, "subscription_plans count:", plansCount.rows[0]?.count || '0');
    
    console.log(logPrefix, "verification complete");
    console.log(logPrefix, "summary:", {
      dbConnected: true,
      usersTableExists: usersCheck.rows[0]?.exists === true,
      usersCount: usersCount.rows[0]?.count || '0',
      subscriptionPlansTableExists: plansCheck.rows[0]?.exists === true,
      subscriptionPlansCount: plansCount.rows[0]?.count || '0',
      subscriptionsTableExists: subsCheck.rows[0]?.exists === true,
      paymentsTableExists: paymentsCheck.rows[0]?.exists === true,
    });
  } finally {
    console.log(logPrefix, "closing DB pool...");
    await pool.end();
    console.log(logPrefix, "done");
  }
}

main().catch((e) => {
  console.error("[apply-saas-tables] FAILED:", e);
  process.exit(1);
});
