-- AlterTable
ALTER TABLE "User" ADD COLUMN     "waContactId" INTEGER,
ADD COLUMN     "waIsMember" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "waMembershipLevel" TEXT,
ADD COLUMN     "waMembershipStatus" TEXT,
ADD COLUMN     "waSyncedAt" TIMESTAMP(3),
ALTER COLUMN "passwordHash" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "User_waContactId_key" ON "User"("waContactId");

