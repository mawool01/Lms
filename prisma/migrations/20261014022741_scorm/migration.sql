-- CreateEnum
CREATE TYPE "ScormVersion" AS ENUM ('SCORM_12', 'SCORM_2004');

-- CreateEnum
CREATE TYPE "ScormGradeMethod" AS ENUM ('SCORE', 'COMPLETION');

-- CreateTable
CREATE TABLE "ScormPackage" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "moduleId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "version" "ScormVersion" NOT NULL,
    "launchPath" TEXT NOT NULL,
    "launchParams" TEXT NOT NULL DEFAULT '',
    "masteryScore" DOUBLE PRECISION,
    "storage" TEXT NOT NULL,
    "storageBase" TEXT NOT NULL,
    "fileCount" INTEGER NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "gradeMethod" "ScormGradeMethod" NOT NULL DEFAULT 'SCORE',
    "weight" INTEGER NOT NULL DEFAULT 20,
    "points" INTEGER NOT NULL DEFAULT 50,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL DEFAULT 0,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScormPackage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScormAttempt" (
    "id" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "cmi" JSONB NOT NULL DEFAULT '{}',
    "completionStatus" TEXT NOT NULL DEFAULT 'not attempted',
    "successStatus" TEXT NOT NULL DEFAULT 'unknown',
    "scoreRaw" DOUBLE PRECISION,
    "scoreMin" DOUBLE PRECISION,
    "scoreMax" DOUBLE PRECISION,
    "scoreScaled" DOUBLE PRECISION,
    "percent" DOUBLE PRECISION,
    "overridePercent" DOUBLE PRECISION,
    "feedback" TEXT,
    "gradedById" TEXT,
    "totalSeconds" INTEGER NOT NULL DEFAULT 0,
    "sessions" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScormAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ScormPackage_courseId_idx" ON "ScormPackage"("courseId");

-- CreateIndex
CREATE UNIQUE INDEX "ScormAttempt_packageId_userId_key" ON "ScormAttempt"("packageId", "userId");

-- AddForeignKey
ALTER TABLE "ScormPackage" ADD CONSTRAINT "ScormPackage_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScormPackage" ADD CONSTRAINT "ScormPackage_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "Module"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScormPackage" ADD CONSTRAINT "ScormPackage_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScormAttempt" ADD CONSTRAINT "ScormAttempt_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "ScormPackage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScormAttempt" ADD CONSTRAINT "ScormAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
