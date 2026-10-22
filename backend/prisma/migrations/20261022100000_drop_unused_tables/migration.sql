-- BE-9: three tables nothing in the app reads or writes (seller badges, user activity log, search queries).
-- Destructive only when it loses nothing: an empty table is dropped; a table that holds rows (written by some
-- tool outside the app) is renamed to archived_<name> instead, keeping every row, so it can be read or dropped
-- by hand later; its foreign keys are dropped, so deleting a user, kitchen or dish later never deletes or changes an
-- archived row. Either way the app's schema no longer has it.
DO $$
DECLARE
  t text;
  fk record;
  has_rows boolean;
BEGIN
  FOREACH t IN ARRAY ARRAY['seller_badges', 'user_activity_logs', 'search_queries'] LOOP
    IF to_regclass(format('public.%I', t)) IS NULL THEN
      CONTINUE;
    END IF;
    EXECUTE format('SELECT EXISTS (SELECT 1 FROM %I)', t) INTO has_rows;
    IF has_rows THEN
      EXECUTE format('ALTER TABLE %I RENAME TO %I', t, 'archived_' || t);
      FOR fk IN SELECT conname FROM pg_constraint WHERE conrelid = format('public.%I', 'archived_' || t)::regclass AND contype = 'f' LOOP
        EXECUTE format('ALTER TABLE %I DROP CONSTRAINT %I', 'archived_' || t, fk.conname);
      END LOOP;
      RAISE NOTICE 'Table % holds rows: kept as archived_%', t, t;
    ELSE
      EXECUTE format('DROP TABLE %I', t);
    END IF;
  END LOOP;
END $$;
