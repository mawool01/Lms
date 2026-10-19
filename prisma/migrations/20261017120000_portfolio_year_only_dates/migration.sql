-- AlterTable
-- Existing dates were all entered with a month, so false is right for them.
ALTER TABLE "PortfolioItem" ADD COLUMN     "endYearOnly" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "startYearOnly" BOOLEAN NOT NULL DEFAULT false;
