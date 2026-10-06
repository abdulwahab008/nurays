-- Staff roles: every staff account is user_type 'admin' with a role. Exactly one super admin.
ALTER TABLE "users" ADD COLUMN "staff_role" TEXT;

-- Existing admins become "admin"; the oldest one becomes the super admin.
UPDATE "users" SET "staff_role" = 'admin' WHERE "user_type" = 'admin';
UPDATE "users" SET "staff_role" = 'super_admin'
WHERE "id" = (SELECT "id" FROM "users" WHERE "user_type" = 'admin' ORDER BY "created_at" ASC, "id" ASC LIMIT 1);

ALTER TABLE "users" ADD CONSTRAINT "users_staff_role_check" CHECK ("staff_role" IS NULL OR "staff_role" IN ('super_admin', 'admin', 'support'));
-- Only staff accounts have a staff role, and every staff account has one.
ALTER TABLE "users" ADD CONSTRAINT "users_staff_role_matches_type" CHECK (("user_type" = 'admin') = ("staff_role" IS NOT NULL));
-- There is only ever one super admin.
CREATE UNIQUE INDEX "users_one_super_admin" ON "users" ("staff_role") WHERE "staff_role" = 'super_admin';
