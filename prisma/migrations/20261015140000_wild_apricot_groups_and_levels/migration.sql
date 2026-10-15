-- Generalizes the Wild Apricot event link into a link that can be an event, a
-- member group or a membership level. Written as renames rather than
-- drop-and-create so any existing links and the enrollments they granted
-- survive, and backfills Enrollment.waLinkId from the old waEventId.

-- CreateEnum
CREATE TYPE "WaLinkKind" AS ENUM ('EVENT', 'GROUP', 'LEVEL');

-- AlterTable: CourseWaEvent becomes CourseWaLink
ALTER TABLE "CourseWaEvent" RENAME TO "CourseWaLink";
ALTER TABLE "CourseWaLink" RENAME COLUMN "waEventId" TO "waId";
ALTER TABLE "CourseWaLink" ADD COLUMN     "kind" "WaLinkKind" NOT NULL DEFAULT 'EVENT';

ALTER TABLE "CourseWaLink" RENAME CONSTRAINT "CourseWaEvent_pkey" TO "CourseWaLink_pkey";
ALTER TABLE "CourseWaLink" RENAME CONSTRAINT "CourseWaEvent_courseId_fkey" TO "CourseWaLink_courseId_fkey";
ALTER TABLE "CourseWaLink" RENAME CONSTRAINT "CourseWaEvent_addedById_fkey" TO "CourseWaLink_addedById_fkey";

-- DropIndex
DROP INDEX "CourseWaEvent_courseId_waEventId_key";

-- DropIndex
DROP INDEX "CourseWaEvent_waEventId_idx";

-- CreateIndex
CREATE UNIQUE INDEX "CourseWaLink_courseId_kind_waId_key" ON "CourseWaLink"("courseId", "kind", "waId");

-- CreateIndex
CREATE INDEX "CourseWaLink_kind_waId_idx" ON "CourseWaLink"("kind", "waId");

-- AlterTable: enrollments point at the link, not a raw Wild Apricot id, because
-- event / group / level ids come from different sequences and can collide.
ALTER TABLE "Enrollment" ADD COLUMN     "waLinkId" TEXT;

UPDATE "Enrollment" e
SET "waLinkId" = l."id"
FROM "CourseWaLink" l
WHERE l."courseId" = e."courseId"
  AND l."waId" = e."waEventId"
  AND l."kind" = 'EVENT';

ALTER TABLE "Enrollment" DROP COLUMN "waEventId";

-- CreateIndex
CREATE INDEX "Enrollment_waLinkId_idx" ON "Enrollment"("waLinkId");

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_waLinkId_fkey" FOREIGN KEY ("waLinkId") REFERENCES "CourseWaLink"("id") ON DELETE SET NULL ON UPDATE CASCADE;
