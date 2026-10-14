-- CreateEnum
CREATE TYPE "CertProgramKind" AS ENUM ('INDIVIDUAL', 'CENTER');

-- CreateEnum
CREATE TYPE "CertApplicationType" AS ENUM ('INITIAL', 'RENEWAL');

-- CreateEnum
CREATE TYPE "CertApplicationStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'CHANGES_REQUESTED', 'APPROVED', 'DENIED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "CertRecommendation" AS ENUM ('APPROVE', 'REVISE', 'DENY');

-- CreateEnum
CREATE TYPE "CertRating" AS ENUM ('DOES_NOT_MEET', 'MEETS', 'EXCEEDS');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "certReviewer" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "institution" TEXT,
ADD COLUMN     "jobTitle" TEXT;

-- CreateTable
CREATE TABLE "CertProgram" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "CertProgramKind" NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "initialValidityMonths" INTEGER NOT NULL DEFAULT 24,
    "renewalValidityMonths" INTEGER NOT NULL DEFAULT 60,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CertProgram_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CertLevel" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "feeNote" TEXT NOT NULL DEFAULT '',
    "lifetime" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CertLevel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CertCriterion" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "levelId" TEXT,
    "section" TEXT NOT NULL DEFAULT '',
    "title" TEXT NOT NULL,
    "guidance" TEXT NOT NULL DEFAULT '',
    "evidenceRequired" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CertCriterion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CertApplication" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "levelId" TEXT NOT NULL,
    "applicantId" TEXT NOT NULL,
    "type" "CertApplicationType" NOT NULL DEFAULT 'INITIAL',
    "renewsCertificationId" TEXT,
    "status" "CertApplicationStatus" NOT NULL DEFAULT 'DRAFT',
    "centerName" TEXT,
    "institution" TEXT,
    "statement" TEXT NOT NULL DEFAULT '',
    "feePaid" BOOLEAN NOT NULL DEFAULT false,
    "feeNote" TEXT NOT NULL DEFAULT '',
    "submittedAt" TIMESTAMP(3),
    "decidedAt" TIMESTAMP(3),
    "decidedById" TEXT,
    "decisionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CertApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CertResponse" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "criterionId" TEXT NOT NULL,
    "narrative" TEXT NOT NULL DEFAULT '',
    "evidence" TEXT[],
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CertResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CertReview" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "recommendation" "CertRecommendation",
    "comments" TEXT NOT NULL DEFAULT '',
    "submittedAt" TIMESTAMP(3),
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CertReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CertReviewScore" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "criterionId" TEXT NOT NULL,
    "rating" "CertRating" NOT NULL,
    "comment" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "CertReviewScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CertMessage" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "internal" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CertMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Certification" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "levelId" TEXT NOT NULL,
    "holderId" TEXT,
    "holderName" TEXT NOT NULL,
    "holderEmail" TEXT,
    "centerName" TEXT,
    "institution" TEXT,
    "issuedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "revokeReason" TEXT,
    "isRenewal" BOOLEAN NOT NULL DEFAULT false,
    "showInDirectory" BOOLEAN NOT NULL DEFAULT true,
    "reminderStage" INTEGER NOT NULL DEFAULT 0,
    "applicationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Certification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CertProgram_key_key" ON "CertProgram"("key");

-- CreateIndex
CREATE INDEX "CertLevel_programId_idx" ON "CertLevel"("programId");

-- CreateIndex
CREATE INDEX "CertCriterion_programId_idx" ON "CertCriterion"("programId");

-- CreateIndex
CREATE INDEX "CertApplication_applicantId_idx" ON "CertApplication"("applicantId");

-- CreateIndex
CREATE INDEX "CertApplication_status_idx" ON "CertApplication"("status");

-- CreateIndex
CREATE UNIQUE INDEX "CertResponse_applicationId_criterionId_key" ON "CertResponse"("applicationId", "criterionId");

-- CreateIndex
CREATE UNIQUE INDEX "CertReview_applicationId_reviewerId_key" ON "CertReview"("applicationId", "reviewerId");

-- CreateIndex
CREATE UNIQUE INDEX "CertReviewScore_reviewId_criterionId_key" ON "CertReviewScore"("reviewId", "criterionId");

-- CreateIndex
CREATE INDEX "CertMessage_applicationId_idx" ON "CertMessage"("applicationId");

-- CreateIndex
CREATE UNIQUE INDEX "Certification_code_key" ON "Certification"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Certification_applicationId_key" ON "Certification"("applicationId");

-- CreateIndex
CREATE INDEX "Certification_holderId_idx" ON "Certification"("holderId");

-- CreateIndex
CREATE INDEX "Certification_expiresAt_idx" ON "Certification"("expiresAt");

-- AddForeignKey
ALTER TABLE "CertLevel" ADD CONSTRAINT "CertLevel_programId_fkey" FOREIGN KEY ("programId") REFERENCES "CertProgram"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CertCriterion" ADD CONSTRAINT "CertCriterion_programId_fkey" FOREIGN KEY ("programId") REFERENCES "CertProgram"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CertCriterion" ADD CONSTRAINT "CertCriterion_levelId_fkey" FOREIGN KEY ("levelId") REFERENCES "CertLevel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CertApplication" ADD CONSTRAINT "CertApplication_programId_fkey" FOREIGN KEY ("programId") REFERENCES "CertProgram"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CertApplication" ADD CONSTRAINT "CertApplication_levelId_fkey" FOREIGN KEY ("levelId") REFERENCES "CertLevel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CertApplication" ADD CONSTRAINT "CertApplication_applicantId_fkey" FOREIGN KEY ("applicantId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CertApplication" ADD CONSTRAINT "CertApplication_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CertApplication" ADD CONSTRAINT "CertApplication_renewsCertificationId_fkey" FOREIGN KEY ("renewsCertificationId") REFERENCES "Certification"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CertResponse" ADD CONSTRAINT "CertResponse_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "CertApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CertResponse" ADD CONSTRAINT "CertResponse_criterionId_fkey" FOREIGN KEY ("criterionId") REFERENCES "CertCriterion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CertReview" ADD CONSTRAINT "CertReview_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "CertApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CertReview" ADD CONSTRAINT "CertReview_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CertReviewScore" ADD CONSTRAINT "CertReviewScore_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "CertReview"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CertReviewScore" ADD CONSTRAINT "CertReviewScore_criterionId_fkey" FOREIGN KEY ("criterionId") REFERENCES "CertCriterion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CertMessage" ADD CONSTRAINT "CertMessage_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "CertApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CertMessage" ADD CONSTRAINT "CertMessage_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Certification" ADD CONSTRAINT "Certification_programId_fkey" FOREIGN KEY ("programId") REFERENCES "CertProgram"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Certification" ADD CONSTRAINT "Certification_levelId_fkey" FOREIGN KEY ("levelId") REFERENCES "CertLevel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Certification" ADD CONSTRAINT "Certification_holderId_fkey" FOREIGN KEY ("holderId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Certification" ADD CONSTRAINT "Certification_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "CertApplication"("id") ON DELETE SET NULL ON UPDATE CASCADE;
