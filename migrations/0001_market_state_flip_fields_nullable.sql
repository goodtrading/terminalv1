-- Make gamma flip related fields nullable for true null-safety end-to-end.
-- Safe to run multiple times.
ALTER TABLE IF EXISTS public.market_state
  ALTER COLUMN gamma_flip DROP NOT NULL,
  ALTER COLUMN distance_to_flip DROP NOT NULL,
  ALTER COLUMN transition_zone_start DROP NOT NULL,
  ALTER COLUMN transition_zone_end DROP NOT NULL;
