-- Where an on-duty rider last was (from their phone), so a new job goes to the rider nearest the kitchen.
ALTER TABLE "riders" ADD COLUMN "last_latitude" DECIMAL(10,8);
ALTER TABLE "riders" ADD COLUMN "last_longitude" DECIMAL(11,8);
ALTER TABLE "riders" ADD COLUMN "last_location_at" TIMESTAMP(3);
