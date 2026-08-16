-- CreateEnum
CREATE TYPE "Condition" AS ENUM ('UNGRADED', 'NEAR_MINT', 'LIGHTLY_PLAYED', 'MODERATELY_PLAYED', 'HEAVILY_PLAYED', 'DAMAGED', 'GRADED_10', 'GRADED_9', 'GRADED_8', 'GRADED_7');

-- CreateEnum
CREATE TYPE "PriceSource" AS ENUM ('PRICECHARTING', 'EBAY', 'MANUAL');

-- CreateEnum
CREATE TYPE "AlertType" AS ENUM ('TRENDING_UP', 'TRENDING_DOWN', 'SELL_SIGNAL', 'NEW_HIGH');

-- CreateTable
CREATE TABLE "cards" (
    "id" TEXT NOT NULL,
    "pricecharting_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "console_name" TEXT,
    "category" TEXT,
    "image_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collection_items" (
    "id" TEXT NOT NULL,
    "card_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "condition" "Condition" NOT NULL DEFAULT 'NEAR_MINT',
    "purchase_price" INTEGER,
    "purchased_at" TIMESTAMP(3),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "collection_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_snapshots" (
    "id" TEXT NOT NULL,
    "card_id" TEXT NOT NULL,
    "source" "PriceSource" NOT NULL,
    "price_type" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "captured_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "price_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ebay_sales" (
    "id" TEXT NOT NULL,
    "card_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "item_url" TEXT NOT NULL,
    "image_url" TEXT,
    "condition" TEXT,
    "sold_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ebay_sales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alerts" (
    "id" TEXT NOT NULL,
    "card_id" TEXT NOT NULL,
    "type" "AlertType" NOT NULL,
    "price_type" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "change_pct" DOUBLE PRECISION NOT NULL,
    "from_price" INTEGER NOT NULL,
    "to_price" INTEGER NOT NULL,
    "window_days" INTEGER NOT NULL,
    "acknowledged" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alerts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cards_pricecharting_id_key" ON "cards"("pricecharting_id");

-- CreateIndex
CREATE UNIQUE INDEX "collection_items_card_id_condition_key" ON "collection_items"("card_id", "condition");

-- CreateIndex
CREATE INDEX "price_snapshots_card_id_price_type_captured_at_idx" ON "price_snapshots"("card_id", "price_type", "captured_at");

-- CreateIndex
CREATE INDEX "ebay_sales_card_id_sold_at_idx" ON "ebay_sales"("card_id", "sold_at");

-- CreateIndex
CREATE UNIQUE INDEX "ebay_sales_item_url_key" ON "ebay_sales"("item_url");

-- CreateIndex
CREATE INDEX "alerts_card_id_created_at_idx" ON "alerts"("card_id", "created_at");

-- CreateIndex
CREATE INDEX "alerts_acknowledged_created_at_idx" ON "alerts"("acknowledged", "created_at");

-- AddForeignKey
ALTER TABLE "collection_items" ADD CONSTRAINT "collection_items_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "cards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_snapshots" ADD CONSTRAINT "price_snapshots_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "cards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ebay_sales" ADD CONSTRAINT "ebay_sales_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "cards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "cards"("id") ON DELETE CASCADE ON UPDATE CASCADE;
