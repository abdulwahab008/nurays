-- Nuray launches in four Lahore areas. Every other area stops being offered (admins can switch one back on from
-- Admin > Communities); buyers there see that Nuray isn't in their area yet.
UPDATE "communities" SET "is_active" = ("slug" IN ('askari-11', 'dha-phase-5', 'dha-phase-6', 'dha-9-town'));
