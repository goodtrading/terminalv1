-- Repoint saas_subscriptions.user_id from saas_users (legacy) to public.users.
-- Run in Neon / psql against the same DATABASE_URL as the app.
--
-- Prerequisite: every user_id in saas_subscriptions / saas_payments must exist in users(id).
-- If legacy rows pointed at saas_users only, align or delete those rows before adding the FK.
--
-- If DROP fails with "constraint does not exist", list FKs on the table:
--   SELECT c.conname, pg_get_constraintdef(c.oid)
--   FROM pg_constraint c
--   JOIN pg_class t ON t.oid = c.conrelid
--   WHERE t.relname = 'saas_subscriptions' AND c.contype = 'f';

ALTER TABLE saas_subscriptions
  DROP CONSTRAINT IF EXISTS saas_subscriptions_user_id_fkey;

ALTER TABLE saas_subscriptions
  ADD CONSTRAINT saas_subscriptions_user_id_fkey
  FOREIGN KEY (user_id)
  REFERENCES users (id)
  ON DELETE CASCADE;

-- If saas_payments also referenced saas_users, fix it the same way:
ALTER TABLE saas_payments
  DROP CONSTRAINT IF EXISTS saas_payments_user_id_fkey;

ALTER TABLE saas_payments
  ADD CONSTRAINT saas_payments_user_id_fkey
  FOREIGN KEY (user_id)
  REFERENCES users (id)
  ON DELETE CASCADE;
