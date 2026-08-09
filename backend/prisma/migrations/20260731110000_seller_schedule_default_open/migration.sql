-- Default a seller's schedule to always-open, not always-closed. The previous
-- default ('fixed_daily' with no operating_hours configured) computed as
-- CLOSED for every pre-existing seller that never touched the new business
-- settings, silently blocking orders platform-wide. Backfill existing rows
-- that never actually configured a schedule, then change the column default
-- for any future inserts that bypass application code.
UPDATE "sellers"
SET "schedule_mode" = '24_7'
WHERE "schedule_mode" = 'fixed_daily' AND "operating_hours" IS NULL;

ALTER TABLE "sellers" ALTER COLUMN "schedule_mode" SET DEFAULT '24_7';

-- Same backward-compatibility issue for delivery modes: pickup was always
-- freely available before this field existed. Backfill sellers who never
-- touched this setting (still at the old delivery-only default) to include
-- pickup too, and widen the column default for future inserts.
UPDATE "sellers"
SET "delivery_modes" = ARRAY['delivery', 'pickup']::TEXT[]
WHERE "delivery_modes" = ARRAY['delivery']::TEXT[];

ALTER TABLE "sellers" ALTER COLUMN "delivery_modes" SET DEFAULT ARRAY['delivery', 'pickup']::TEXT[];
