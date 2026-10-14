-- CreateTable
CREATE TABLE "SiteSettings" (
    "id" TEXT NOT NULL DEFAULT 'site',
    "siteName" TEXT NOT NULL DEFAULT 'ICLCA Learning',
    "shortName" TEXT NOT NULL DEFAULT 'ICLCA',
    "orgName" TEXT NOT NULL DEFAULT 'International College Learning Center Association',
    "tagline" TEXT NOT NULL DEFAULT 'Learn, teach and grow together',
    "loginMessage" TEXT NOT NULL DEFAULT '',
    "primaryColor" TEXT NOT NULL DEFAULT '#2547ea',
    "accentColor" TEXT NOT NULL DEFAULT '#c8992e',
    "logoUrl" TEXT,
    "faviconUrl" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "SiteSettings_pkey" PRIMARY KEY ("id")
);

