-- How many orders a kitchen can have still to cook (new, accepted or preparing) before new ones wait; null = no limit.
ALTER TABLE "sellers" ADD COLUMN "max_open_orders" INTEGER;
ALTER TABLE "sellers" ADD CONSTRAINT "sellers_max_open_orders_positive" CHECK ("max_open_orders" IS NULL OR "max_open_orders" > 0);
