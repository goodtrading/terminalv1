-- Run in Neon/psql if Postgres still reports violations against "saas_users".
-- Lists every foreign key in public whose referenced table is saas_users.

SELECT
  n.nspname AS table_schema,
  c.relname AS table_name,
  con.conname AS constraint_name,
  pg_get_constraintdef(con.oid) AS definition
FROM pg_constraint con
JOIN pg_class c ON c.oid = con.conrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_class ref ON ref.oid = con.confrelid
WHERE con.contype = 'f'
  AND n.nspname = 'public'
  AND ref.relname = 'saas_users'
ORDER BY c.relname, con.conname;
