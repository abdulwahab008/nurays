-- Payouts wait after a kitchen changes where it is paid, and a large payout is approved by a second admin before it is sent.
ALTER TABLE "sellers" ADD COLUMN "payout_account_changed_at" TIMESTAMP(3);

ALTER TABLE "payout_events" DROP CONSTRAINT "payout_events_event";
ALTER TABLE "payout_events" ADD CONSTRAINT "payout_events_event" CHECK ("event" IN ('created', 'approved', 'sent', 'failed', 'received', 'not_received', 'payment_received'));
