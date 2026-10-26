-- SEC-R7: the audit log is kept for two years (decided 26 October 2026). It stays append-only: no row can be edited,
-- and a row younger than two years can never be deleted, by anyone. The one new exception is the daily retention job
-- (services/audit-retention.service.ts), which turns on nuray.audit_purge for its own transaction and deletes rows
-- older than two years. The age check is here in the database, so no setting or bug in the app can delete newer rows.
-- Detaching an account's rows (user_id set to NULL when the account is deleted) is allowed as before.
CREATE OR REPLACE FUNCTION audit_logs_append_only() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF current_setting('nuray.audit_purge', true) = 'on' AND OLD.created_at < now() - interval '2 years' THEN
      RETURN OLD;
    END IF;
    RAISE EXCEPTION 'audit_logs is append-only: rows cannot be deleted';
  END IF;
  IF NEW.user_id IS NOT NULL OR (to_jsonb(NEW) - 'user_id') IS DISTINCT FROM (to_jsonb(OLD) - 'user_id') THEN
    RAISE EXCEPTION 'audit_logs is append-only: rows cannot be changed';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
