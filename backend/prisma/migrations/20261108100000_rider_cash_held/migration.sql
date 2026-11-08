-- LOAD-7: the cash a rider carries, kept on the rider so the cash-limit check on dispatch, the job list and
-- claims reads one row instead of summing the rider's whole ledger. It is maintained here, in the database,
-- by a trigger that runs inside the same transaction as every ledger write (any writer, including
-- ON CONFLICT DO NOTHING inserts that skip a row, updates and deletes), so it cannot drift from the ledger.
-- The rule is unchanged: cash held = -(sum of cod_collected + cash_deposit entries).
ALTER TABLE "riders" ADD COLUMN "cash_held" DECIMAL(12,2) NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION rider_ledger_cash_held() RETURNS trigger AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') AND OLD.type IN ('cod_collected', 'cash_deposit') THEN
    UPDATE "riders" SET "cash_held" = "cash_held" + OLD.amount WHERE id = OLD.rider_id;
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') AND NEW.type IN ('cod_collected', 'cash_deposit') THEN
    UPDATE "riders" SET "cash_held" = "cash_held" - NEW.amount WHERE id = NEW.rider_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Writers wait from here to the end of the migration, so no entry lands between the trigger and the backfill.
LOCK TABLE "rider_ledger_entries" IN SHARE ROW EXCLUSIVE MODE;

CREATE TRIGGER rider_ledger_cash_held AFTER INSERT OR UPDATE OR DELETE ON "rider_ledger_entries"
  FOR EACH ROW EXECUTE FUNCTION rider_ledger_cash_held();

UPDATE "riders" r SET "cash_held" = held.cash
FROM (
  SELECT rider_id, -SUM(amount) AS cash FROM "rider_ledger_entries"
  WHERE type IN ('cod_collected', 'cash_deposit') GROUP BY rider_id
) held
WHERE held.rider_id = r.id;
