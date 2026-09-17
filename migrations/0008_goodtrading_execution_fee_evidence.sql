ALTER TABLE goodtrading_broker_observation_snapshots
  ADD COLUMN IF NOT EXISTS fee_amount text,
  ADD COLUMN IF NOT EXISTS fee_asset text,
  ADD COLUMN IF NOT EXISTS fee_conflict boolean NOT NULL DEFAULT false;

ALTER TABLE goodtrading_broker_observation_snapshots
  ADD CONSTRAINT goodtrading_broker_snapshot_fee_amount_chk
  CHECK (fee_amount IS NULL OR fee_amount ~ '^-?(0|[1-9][0-9]*)([.][0-9]+)?$');

ALTER TABLE goodtrading_broker_observation_snapshots
  ADD CONSTRAINT goodtrading_broker_snapshot_fee_asset_chk
  CHECK (fee_asset IS NULL OR length(trim(fee_asset)) > 0);

ALTER TABLE goodtrading_broker_observation_snapshots
  ADD CONSTRAINT goodtrading_broker_snapshot_fee_conflict_chk
  CHECK (fee_conflict = false OR fee_amount IS NULL);
