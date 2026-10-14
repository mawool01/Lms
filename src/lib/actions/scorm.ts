"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { requireCourseManager } from "@/lib/permissions";
import { deleteStoredFiles } from "@/lib/scorm/storage";
import { checkCourseCompletion } from "@/lib/gamification";
import type { ActionResult } from "@/lib/action-types";

async function managedPackage(packageId: string) {
  const user = await requireUser();
  const pkg = await db.scormPackage.findUniqueOrThrow({ where: { id: packageId } });
  await requireCourseManager(user, pkg.courseId);
  return { user, pkg };
}

export async function updateScormPackage(packageId: string, _prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const { pkg } = await managedPackage(packageId);
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return { error: "Title is required." };
  const moduleId = String(formData.get("moduleId") ?? "") || null;
  if (moduleId && !(await db.module.findFirst({ where: { id: moduleId, courseId: pkg.courseId } }))) return { error: "Unknown module." };
  const clampInt = (v: FormDataEntryValue | null, max: number, fallback: number) => {
    const n = Math.round(Number(v));
    return Number.isFinite(n) ? Math.max(0, Math.min(max, n)) : fallback;
  };
  await db.scormPackage.update({
    where: { id: packageId },
    data: {
      title,
      description: String(formData.get("description") ?? "").trim(),
      moduleId,
      gradeMethod: formData.get("gradeMethod") === "COMPLETION" ? "COMPLETION" : "SCORE",
      weight: clampInt(formData.get("weight"), 1000, pkg.weight),
      points: clampInt(formData.get("points"), 1000, pkg.points),
      published: formData.get("published") === "on",
    },
  });
  revalidatePath(`/courses/${pkg.courseId}`, "layout");
  return { ok: "Settings saved." };
}

export async function deleteScormPackage(packageId: string) {
  const { pkg } = await managedPackage(packageId);
  await db.scormPackage.delete({ where: { id: packageId } });
  await deleteStoredFiles(pkg).catch((e) => console.error("Failed to delete SCORM files", e));
  redirect(`/courses/${pkg.courseId}`);
}

export async function overrideScormGrade(attemptId: string, _prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const attempt = await db.scormAttempt.findUniqueOrThrow({ where: { id: attemptId } });
  const { user, pkg } = await managedPackage(attempt.packageId);
  const raw = String(formData.get("grade") ?? "").trim();
  const grade = raw === "" ? null : Number(raw);
  if (grade !== null && (!Number.isFinite(grade) || grade < 0 || grade > 100)) return { error: "Grade must be a percentage from 0 to 100." };
  await db.scormAttempt.update({
    where: { id: attemptId },
    data: { overridePercent: grade, feedback: String(formData.get("feedback") ?? "").trim() || null, gradedById: user.id },
  });
  revalidatePath(`/courses/${pkg.courseId}`, "layout");
  return { ok: grade === null ? "Override removed — using the package score." : "Grade saved." };
}

/** Lets a learner start the package over (clears their tracking data, keeps earned points). */
export async function resetScormAttempt(attemptId: string) {
  const attempt = await db.scormAttempt.findUniqueOrThrow({ where: { id: attemptId } });
  const { pkg } = await managedPackage(attempt.packageId);
  await db.scormAttempt.delete({ where: { id: attemptId } });
  revalidatePath(`/courses/${pkg.courseId}`, "layout");
}

/** Records completion for a learner whose package can't report it (e.g. broken content). */
export async function markScormComplete(packageId: string, userId: string) {
  const { user, pkg } = await managedPackage(packageId);
  await db.scormAttempt.upsert({
    where: { packageId_userId: { packageId, userId } },
    update: { completionStatus: "completed", completedAt: new Date(), gradedById: user.id },
    create: { packageId, userId, completionStatus: "completed", completedAt: new Date(), gradedById: user.id },
  });
  await checkCourseCompletion(userId, pkg.courseId);
  revalidatePath(`/courses/${pkg.courseId}`, "layout");
}
