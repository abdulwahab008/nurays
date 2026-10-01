-- Session revocation, password reset, and re-verification of unproven phone numbers.
-- Re-runnable; assumes "users" exists.

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "tokens_valid_after" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "password_resets" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "password_resets_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "password_resets_token_hash_key" ON "password_resets"("token_hash");
CREATE INDEX IF NOT EXISTS "password_resets_user_id_idx" ON "password_resets"("user_id");
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'password_resets_user_id_fkey') THEN
        ALTER TABLE "password_resets" ADD CONSTRAINT "password_resets_user_id_fkey"
            FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- Before phone verification existed every number typed at signup was stored as verified. An
-- account whose EMAIL was never verified and whose number was never proven is exactly what a
-- pre-registration hijack looks like, so those numbers must be re-verified (the owner can
-- still log in by email and verify from their profile). Accounts with a verified email keep
-- their status.
UPDATE "users" SET "phone_verified" = false
WHERE "phone_verified" = true AND "email_verified" = false AND "email" IS NOT NULL AND "phone" NOT LIKE '+999%';
