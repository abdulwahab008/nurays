-- Since when a kitchen has owed Nuray money (commission on cash it collected that its online earnings did not cover).
-- Additive and nullable: every existing kitchen starts at NULL (owes nothing yet) and the app fills it in from the
-- balance, so nothing has to be backfilled. Fourteen days after it is set, that kitchen's new cash orders pause until
-- it pays (src/services/kitchen-owing.service.ts).
ALTER TABLE "sellers" ADD COLUMN "owes_since" TIMESTAMP(3);
