-- A phone number counts only after its owner proves it with an OTP.
-- New accounts start unverified (the default used to be true, so every number typed
-- at signup was treated as verified).
ALTER TABLE "users" ALTER COLUMN "phone_verified" SET DEFAULT false;

-- Placeholder numbers generated for email/Google signups (+999...) were never real.
-- Existing accounts with a real-looking number are left as they are: we can't tell
-- which of them ever received a code, and unverifying everyone would lock them out
-- of OTP login at once.
UPDATE "users" SET "phone_verified" = false WHERE "phone" LIKE '+999%' AND "phone_verified" = true;
