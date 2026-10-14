-- AlterEnum
ALTER TYPE "QuestionType" ADD VALUE 'ESSAY';

-- AlterTable
ALTER TABLE "Assignment" ADD COLUMN     "rubricId" TEXT;

-- AlterTable
ALTER TABLE "Question" ADD COLUMN     "rubricId" TEXT;

-- AlterTable
ALTER TABLE "QuizAttempt" ADD COLUMN     "gradedAt" TIMESTAMP(3),
ADD COLUMN     "needsGrading" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Submission" ADD COLUMN     "rubricScores" JSONB;

-- CreateTable
CREATE TABLE "Rubric" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "criteria" JSONB NOT NULL DEFAULT '[]',
    "shared" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Rubric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeCheckResponse" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "blockId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "firstTryCorrect" BOOLEAN NOT NULL,
    "correct" BOOLEAN NOT NULL,
    "lastAnswer" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KnowledgeCheckResponse_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Rubric_ownerId_idx" ON "Rubric"("ownerId");

-- CreateIndex
CREATE INDEX "KnowledgeCheckResponse_lessonId_idx" ON "KnowledgeCheckResponse"("lessonId");

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgeCheckResponse_userId_lessonId_questionId_key" ON "KnowledgeCheckResponse"("userId", "lessonId", "questionId");

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_rubricId_fkey" FOREIGN KEY ("rubricId") REFERENCES "Rubric"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_rubricId_fkey" FOREIGN KEY ("rubricId") REFERENCES "Rubric"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rubric" ADD CONSTRAINT "Rubric_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeCheckResponse" ADD CONSTRAINT "KnowledgeCheckResponse_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeCheckResponse" ADD CONSTRAINT "KnowledgeCheckResponse_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

