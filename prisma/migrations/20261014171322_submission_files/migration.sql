-- AlterTable
ALTER TABLE "Submission" ADD COLUMN     "files" TEXT[] DEFAULT ARRAY[]::TEXT[];
