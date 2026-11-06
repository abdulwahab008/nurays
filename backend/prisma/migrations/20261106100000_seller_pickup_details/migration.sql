-- Where a rider collects a kitchen's food: street address, landmark and a phone number to call on arrival.
-- Additive and nullable: existing kitchens start at NULL and fill them in from Settings; rider jobs fall back
-- to the kitchen's name and owner's phone until they do.
ALTER TABLE "sellers" ADD COLUMN "pickup_address" TEXT;
ALTER TABLE "sellers" ADD COLUMN "pickup_landmark" TEXT;
ALTER TABLE "sellers" ADD COLUMN "pickup_phone" TEXT;
