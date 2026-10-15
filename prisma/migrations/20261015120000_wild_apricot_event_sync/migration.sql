-- CreateEnum
CREATE TYPE "EnrollmentSource" AS ENUM ('MANUAL', 'WILD_APRICOT');

-- CreateEnum
CREATE TYPE "WaSyncTrigger" AS ENUM ('CRON', 'ADMIN', 'SIGN_IN');

-- AlterTable
ALTER TABLE "Enrollment" ADD COLUMN     "source" "EnrollmentSource" NOT NULL DEFAULT 'MANUAL',
ADD COLUMN     "waEventId" INTEGER,
ADD COLUMN     "waRegistrationId" INTEGER;

-- CreateTable
CREATE TABLE "CourseWaEvent" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "waEventId" INTEGER NOT NULL,
    "waAccountId" INTEGER,
    "name" TEXT NOT NULL DEFAULT '',
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "revoke" BOOLEAN NOT NULL DEFAULT true,
    "lastSyncedAt" TIMESTAMP(3),
    "lastCount" INTEGER,
    "lastError" TEXT,
    "addedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CourseWaEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WaSyncRun" (
    "id" TEXT NOT NULL,
    "trigger" "WaSyncTrigger" NOT NULL,
    "dryRun" BOOLEAN NOT NULL DEFAULT false,
    "ok" BOOLEAN NOT NULL DEFAULT true,
    "links" INTEGER NOT NULL DEFAULT 0,
    "linksFailed" INTEGER NOT NULL DEFAULT 0,
    "registrations" INTEGER NOT NULL DEFAULT 0,
    "enrolled" INTEGER NOT NULL DEFAULT 0,
    "revoked" INTEGER NOT NULL DEFAULT 0,
    "unmatched" INTEGER NOT NULL DEFAULT 0,
    "summary" TEXT NOT NULL DEFAULT '',
    "detail" JSONB NOT NULL DEFAULT '{}',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "WaSyncRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Enrollment_courseId_source_idx" ON "Enrollment"("courseId", "source");

-- CreateIndex
CREATE UNIQUE INDEX "CourseWaEvent_courseId_waEventId_key" ON "CourseWaEvent"("courseId", "waEventId");

-- CreateIndex
CREATE INDEX "CourseWaEvent_waEventId_idx" ON "CourseWaEvent"("waEventId");

-- CreateIndex
CREATE INDEX "WaSyncRun_startedAt_idx" ON "WaSyncRun"("startedAt");

-- AddForeignKey
ALTER TABLE "CourseWaEvent" ADD CONSTRAINT "CourseWaEvent_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseWaEvent" ADD CONSTRAINT "CourseWaEvent_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
