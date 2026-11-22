-- Sign-up already records 'home_kitchen' unless the seller picks another type; only rows written without one
-- (the demo seed) fell back to 'restaurant' and showed every home cook under Restaurants.
ALTER TABLE "sellers" ALTER COLUMN "business_type" SET DEFAULT 'home_kitchen';
