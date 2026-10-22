-- SEC-3: two-step sign-in for staff. One row per staff member who has set it up: the authenticator secret
-- (sealed with AES-256-GCM), the last code step accepted, and the hashes of the unused backup codes.
CREATE TABLE "staff_two_factor" (
    "user_id" TEXT NOT NULL,
    "secret_sealed" TEXT NOT NULL,
    "enabled_at" TIMESTAMP(3),
    "last_used_step" INTEGER,
    "backup_code_hashes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_two_factor_pkey" PRIMARY KEY ("user_id")
);

ALTER TABLE "staff_two_factor" ADD CONSTRAINT "staff_two_factor_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Staff sign in once more after this release, through the new step: their current sessions end.
UPDATE "refresh_tokens" SET "revoked_at" = CURRENT_TIMESTAMP
WHERE "revoked_at" IS NULL AND "user_id" IN (SELECT "id" FROM "users" WHERE "user_type" = 'admin');
