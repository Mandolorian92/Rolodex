-- AlterTable
ALTER TABLE "cards" ADD COLUMN     "manabox_id" TEXT,
ADD COLUMN     "pokemontcg_id" TEXT,
ADD COLUMN     "scryfall_id" TEXT,
ALTER COLUMN "pricecharting_id" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "cards_scryfall_id_key" ON "cards"("scryfall_id");

-- CreateIndex
CREATE UNIQUE INDEX "cards_pokemontcg_id_key" ON "cards"("pokemontcg_id");

-- CreateIndex
CREATE UNIQUE INDEX "cards_manabox_id_key" ON "cards"("manabox_id");

-- DataMigration: cards previously keyed as pricecharting_id = 'manabox:<id>' (the old
-- string-prefix hack — see src/lib/cardMeta.ts history) move that id into the new,
-- properly-typed manabox_id column and lose the fake pricecharting_id, so they read as what
-- they actually are: a card with no real PriceCharting id, not a card whose id happens to
-- start with "manabox:".
UPDATE "cards"
SET "manabox_id" = substring("pricecharting_id" from 9), -- strip the 8-char 'manabox:' prefix
    "pricecharting_id" = NULL
WHERE "pricecharting_id" LIKE 'manabox:%';
