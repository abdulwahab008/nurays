-- A kitchen may have its orders accepted for it the moment they can be accepted.
ALTER TABLE "sellers" ADD COLUMN "auto_accept_orders" BOOLEAN NOT NULL DEFAULT false;
-- How long before a pre-order's slot the kitchen starts on it: the rider is sent then, and an order still not accepted is cancelled.
ALTER TABLE "sellers" ADD COLUMN "pre_order_lead_minutes" INTEGER;
-- Whether a kitchen's deal takes its discount off every dish ('per_dish', how deals have always worked) or once off the order ('per_order').
ALTER TABLE "promotions" ADD COLUMN "discount_scope" TEXT NOT NULL DEFAULT 'per_dish';
