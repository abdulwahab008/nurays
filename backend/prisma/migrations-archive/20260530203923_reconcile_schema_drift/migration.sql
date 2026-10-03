-- AlterTable
ALTER TABLE "cart_items" ADD COLUMN     "variant_id" TEXT;

-- AlterTable
ALTER TABLE "categories" ADD COLUMN     "product_type" TEXT;

-- AlterTable
ALTER TABLE "order_items" ADD COLUMN     "variant_id" TEXT,
ADD COLUMN     "variant_name" TEXT;

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "cost_price" DECIMAL(10,2),
ADD COLUMN     "preparation_time" INTEGER,
ADD COLUMN     "product_type" TEXT NOT NULL DEFAULT 'frozen',
ADD COLUMN     "shelf_life_hours" INTEGER;

-- AlterTable
ALTER TABLE "sellers" ADD COLUMN     "delivery_fee_base" INTEGER,
ADD COLUMN     "delivery_fee_fixed" INTEGER,
ADD COLUMN     "delivery_fee_per_km" DECIMAL(6,2),
ADD COLUMN     "delivery_fee_type" TEXT,
ADD COLUMN     "enable_stock_alerts" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "free_delivery_areas" JSONB,
ADD COLUMN     "free_delivery_radius_km" DOUBLE PRECISION,
ADD COLUMN     "latitude" DECIMAL(10,8),
ADD COLUMN     "longitude" DECIMAL(11,8),
ADD COLUMN     "low_stock_threshold" INTEGER NOT NULL DEFAULT 10;

-- CreateTable
CREATE TABLE "stock_alerts" (
    "id" TEXT NOT NULL,
    "seller_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "variant_id" TEXT,
    "alert_type" TEXT NOT NULL,
    "current_stock" INTEGER NOT NULL,
    "threshold" INTEGER NOT NULL,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "is_dismissed" BOOLEAN NOT NULL DEFAULT false,
    "email_sent" BOOLEAN NOT NULL DEFAULT false,
    "sms_sent" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "read_at" TIMESTAMP(3),

    CONSTRAINT "stock_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "category_requests" (
    "id" TEXT NOT NULL,
    "seller_id" TEXT NOT NULL,
    "product_type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "name_urdu" TEXT,
    "description" TEXT,
    "parent_category_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "admin_notes" TEXT,
    "reviewed_by" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "category_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_variants" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "name_urdu" TEXT,
    "sku" TEXT,
    "price" DECIMAL(10,2) NOT NULL,
    "original_price" DECIMAL(10,2),
    "cost_price" DECIMAL(10,2),
    "stock_quantity" INTEGER NOT NULL DEFAULT 0,
    "stock_threshold" INTEGER NOT NULL DEFAULT 10,
    "weight_grams" INTEGER,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_variants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "product_variants_sku_key" ON "product_variants"("sku");

-- AddForeignKey
ALTER TABLE "stock_alerts" ADD CONSTRAINT "stock_alerts_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "sellers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "category_requests" ADD CONSTRAINT "category_requests_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "sellers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "category_requests" ADD CONSTRAINT "category_requests_parent_category_id_fkey" FOREIGN KEY ("parent_category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

