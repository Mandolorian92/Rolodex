-- CreateEnum
CREATE TYPE "Retailer" AS ENUM ('GAMESTOP', 'WALMART', 'TARGET', 'BESTBUY');

-- CreateEnum
CREATE TYPE "WatchKind" AS ENUM ('PRODUCT', 'SEARCH');

-- CreateTable
CREATE TABLE "watch_targets" (
    "id" TEXT NOT NULL,
    "retailer" "Retailer" NOT NULL,
    "kind" "WatchKind" NOT NULL DEFAULT 'PRODUCT',
    "label" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "sku" TEXT,
    "keyword" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "inStock" BOOLEAN,
    "lastTitle" TEXT,
    "last_price_cents" INTEGER,
    "last_checked_at" TIMESTAMP(3),
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "watch_targets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seen_products" (
    "id" TEXT NOT NULL,
    "watch_target_id" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "seen_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_alerts" (
    "id" TEXT NOT NULL,
    "watch_target_id" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "acknowledged" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "watch_targets_url_key" ON "watch_targets"("url");

-- CreateIndex
CREATE UNIQUE INDEX "seen_products_watch_target_id_external_id_key" ON "seen_products"("watch_target_id", "external_id");

-- CreateIndex
CREATE INDEX "stock_alerts_watch_target_id_created_at_idx" ON "stock_alerts"("watch_target_id", "created_at");

-- CreateIndex
CREATE INDEX "stock_alerts_acknowledged_created_at_idx" ON "stock_alerts"("acknowledged", "created_at");

-- AddForeignKey
ALTER TABLE "seen_products" ADD CONSTRAINT "seen_products_watch_target_id_fkey" FOREIGN KEY ("watch_target_id") REFERENCES "watch_targets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_alerts" ADD CONSTRAINT "stock_alerts_watch_target_id_fkey" FOREIGN KEY ("watch_target_id") REFERENCES "watch_targets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
