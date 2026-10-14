import "server-only";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import type { CurrentUser } from "@/lib/auth";

export const EDITABLE_STATUSES = ["DRAFT", "CHANGES_REQUESTED"] as const;
export const isEditable = (status: string) => (EDITABLE_STATUSES as readonly string[]).includes(status);
export const isCertAdmin = (user: CurrentUser) => user.role === "ADMIN";

/** Criteria that apply to an application's program + level, in display order. */
export function criteriaFor(programId: string, levelId: string) {
  return db.certCriterion.findMany({
    where: { programId, active: true, OR: [{ levelId: null }, { levelId }] },
    orderBy: [{ position: "asc" }, { id: "asc" }],
  });
}

/**
 * Loads an application and the viewer's relationship to it.
 * Applicants see their own; assigned reviewers and admins see all.
 */
export async function getApplicationAccess(user: CurrentUser, applicationId: string) {
  const app = await db.certApplication.findUnique({
    where: { id: applicationId },
    include: {
      program: true,
      level: true,
      applicant: { select: { id: true, name: true, email: true, institution: true, jobTitle: true } },
      reviews: { include: { reviewer: { select: { id: true, name: true } }, scores: true } },
    },
  });
  if (!app) notFound();
  const isApplicant = app.applicantId === user.id;
  const myReview = app.reviews.find((r) => r.reviewerId === user.id) ?? null;
  const isAdmin = isCertAdmin(user);
  if (!isApplicant && !myReview && !isAdmin) notFound();
  return { app, isApplicant, isAdmin, myReview, isReviewer: !!myReview };
}
