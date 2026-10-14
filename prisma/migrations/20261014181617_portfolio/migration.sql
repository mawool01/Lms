-- CreateEnum
CREATE TYPE "PortfolioVisibility" AS ENUM ('PUBLIC', 'UNLISTED', 'PRIVATE');

-- CreateEnum
CREATE TYPE "PortfolioItemType" AS ENUM ('POSITION', 'PRESENTATION', 'PUBLICATION', 'SERVICE', 'AWARD', 'PROFESSIONAL_DEVELOPMENT');

-- CreateEnum
CREATE TYPE "PortfolioVerification" AS ENUM ('NONE', 'REQUESTED', 'VERIFIED', 'DECLINED');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "portfolioHeadline" TEXT,
ADD COLUMN     "portfolioShowBadges" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "portfolioShowCertifications" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "portfolioShowCourses" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "portfolioSlug" TEXT,
ADD COLUMN     "portfolioSummary" TEXT,
ADD COLUMN     "portfolioVisibility" "PortfolioVisibility" NOT NULL DEFAULT 'UNLISTED';

-- CreateTable
CREATE TABLE "PortfolioItem" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "PortfolioItemType" NOT NULL,
    "title" TEXT NOT NULL,
    "organization" TEXT,
    "role" TEXT,
    "location" TEXT,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "current" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT NOT NULL DEFAULT '',
    "url" TEXT,
    "files" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "hours" DOUBLE PRECISION,
    "collaborators" TEXT,
    "visible" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL DEFAULT 0,
    "verification" "PortfolioVerification" NOT NULL DEFAULT 'NONE',
    "verificationNote" TEXT,
    "verifiedById" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PortfolioItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PortfolioItem_userId_idx" ON "PortfolioItem"("userId");

-- CreateIndex
CREATE INDEX "PortfolioItem_verification_idx" ON "PortfolioItem"("verification");

-- CreateIndex
CREATE UNIQUE INDEX "User_portfolioSlug_key" ON "User"("portfolioSlug");

-- AddForeignKey
ALTER TABLE "PortfolioItem" ADD CONSTRAINT "PortfolioItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortfolioItem" ADD CONSTRAINT "PortfolioItem_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

