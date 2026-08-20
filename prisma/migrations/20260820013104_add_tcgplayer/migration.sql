-- AlterEnum
ALTER TYPE "PriceSource" ADD VALUE 'TCGPLAYER_MARKET';

-- AlterTable
ALTER TABLE "cards" ADD COLUMN     "tcgplayer_checked_at" TIMESTAMP(3),
ADD COLUMN     "tcgplayer_product_id" TEXT;
