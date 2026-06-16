-- Non-destructive auth columns for email verification and password reset.
-- Existing active users are backfilled as email_verified = true.

ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified boolean NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_code_hash text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_code_expires_at timestamp;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_token_hash text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_expires_at timestamp;
ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at timestamp DEFAULT now() NOT NULL;

-- Legacy / active accounts: treat as verified (do not force re-verification).
UPDATE users
SET email_verified = true
WHERE email_verified = false
  AND (
    status IN ('active', 'approved_to_pay', 'pending_payment_review')
    OR role IN ('admin', 'member')
    OR EXISTS (
      SELECT 1
      FROM saas_subscriptions s
      WHERE s.user_id = users.id
        AND s.status = 'active'
        AND s.ends_at > now()
    )
  );
