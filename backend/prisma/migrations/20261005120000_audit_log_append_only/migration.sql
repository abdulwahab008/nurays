-- The audit log is append-only: rows cannot be edited or deleted, not even by the application's own
-- database user. The one allowed change is detaching an account's rows (user_id set to NULL) when the
-- account itself is deleted (the foreign key's ON DELETE SET NULL).
CREATE OR REPLACE FUNCTION audit_logs_append_only() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'audit_logs is append-only: rows cannot be deleted';
  END IF;
  IF NEW.user_id IS NOT NULL OR (to_jsonb(NEW) - 'user_id') IS DISTINCT FROM (to_jsonb(OLD) - 'user_id') THEN
    RAISE EXCEPTION 'audit_logs is append-only: rows cannot be changed';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_logs_no_update BEFORE UPDATE ON "audit_logs" FOR EACH ROW EXECUTE FUNCTION audit_logs_append_only();
CREATE TRIGGER audit_logs_no_delete BEFORE DELETE ON "audit_logs" FOR EACH ROW EXECUTE FUNCTION audit_logs_append_only();
