"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireRole, requireUser } from "@/lib/auth";
import { requireCourseManager } from "@/lib/permissions";
import { WaError, waAdminEnabled } from "@/lib/wildapricot";
import { waGetEvent } from "@/lib/wildapricot-admin";
import { type WaSyncResult, syncWaEnrollments, waSyncSummary } from "@/lib/wildapricot-sync";
import type { ActionResult } from "@/lib/action-types";

/** Links a Wild Apricot event to a course, and runs the sync so the result is visible at once. */
export async function linkCourseWaEvent(courseId: string, _prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  await requireCourseManager(user, courseId);
  if (!waAdminEnabled()) return { error: "Wild Apricot registration sync isn't configured." };

  // Accept a bare id or a pasted Wild Apricot event URL (…/event-1234567).
  const raw = String(formData.get("waEventId") ?? "").trim();
  const waEventId = Number(raw.match(/(\d{3,})\s*$/)?.[1] ?? raw);
  if (!Number.isInteger(waEventId) || waEventId <= 0) {
    return { error: "Enter the Wild Apricot event id (the number at the end of the event's web address)." };
  }

  let event;
  try {
    event = await waGetEvent(waEventId);
  } catch (e) {
    return { error: e instanceof WaError ? e.message : "Couldn't reach Wild Apricot. Please try again." };
  }
  if (!event) return { error: `Wild Apricot has no event ${waEventId}. Check the id and try again.` };

  const existing = await db.courseWaEvent.findUnique({ where: { courseId_waEventId: { courseId, waEventId } } });
  if (existing) return { error: `“${event.name}” is already linked to this course.` };

  await db.courseWaEvent.create({
    data: {
      courseId,
      waEventId,
      name: event.name,
      startsAt: event.startDate,
      endsAt: event.endDate,
      addedById: user.id,
    },
  });

  const result = await syncWaEnrollments({ trigger: "ADMIN", courseId });
  revalidateWa(courseId);
  return { ok: `Linked “${event.name}”. ${waSyncSummary(result)}` };
}

export async function unlinkCourseWaEvent(linkId: string): Promise<void> {
  const user = await requireUser();
  const link = await db.courseWaEvent.findUnique({ where: { id: linkId }, select: { courseId: true } });
  if (!link) return;
  await requireCourseManager(user, link.courseId);
  // Enrollments stay: taking the link away shouldn't take away access someone already has.
  await db.courseWaEvent.delete({ where: { id: linkId } });
  revalidateWa(link.courseId);
}

/** Flips one of the two per-link switches: `active` (keep syncing) or `revoke` (mirror cancellations). */
export async function toggleCourseWaEvent(linkId: string, field: "active" | "revoke"): Promise<void> {
  const user = await requireUser();
  const link = await db.courseWaEvent.findUnique({ where: { id: linkId }, select: { courseId: true, active: true, revoke: true } });
  if (!link) return;
  await requireCourseManager(user, link.courseId);
  await db.courseWaEvent.update({
    where: { id: linkId },
    // Re-enabling a link that was retired for being long over clears the explanation with it.
    data: field === "active" ? { active: !link.active, lastError: null } : { revoke: !link.revoke },
  });
  revalidateWa(link.courseId);
}

/** Syncs one course. `dryRun` reports what would change without writing. */
export async function syncCourseWaEnrollments(courseId: string, _prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  await requireCourseManager(user, courseId);
  return runSync({ trigger: "ADMIN", courseId, dryRun: formData.get("dryRun") === "1", force: formData.get("force") === "1" }, courseId);
}

/** Syncs every linked course. Admin only. */
export async function syncAllWaEnrollments(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireRole("ADMIN");
  return runSync({ trigger: "ADMIN", dryRun: formData.get("dryRun") === "1", force: formData.get("force") === "1" });
}

async function runSync(opts: Parameters<typeof syncWaEnrollments>[0], courseId?: string): Promise<ActionResult> {
  if (!waAdminEnabled()) return { error: "Wild Apricot registration sync isn't configured. Set WILDAPRICOT_API_KEY." };
  let result: WaSyncResult;
  try {
    result = await syncWaEnrollments(opts);
  } catch (e) {
    console.error("Wild Apricot sync failed", e);
    return { error: e instanceof WaError ? e.message : "The sync failed. Check the server logs." };
  }
  revalidateWa(courseId);

  const summary = waSyncSummary(result);
  const blocked = result.skippedRevocation.map((s) => `${s.courseCode}: ${s.reason}`);
  // Anything the admin needs to act on is an error, so it renders in red.
  if (blocked.length) return { error: `${summary} Removals held back — ${blocked.join("; ")}.` };
  if (result.errors.length) return { error: `${summary} Problems: ${result.errors.join("; ")}` };
  return { ok: summary };
}

function revalidateWa(courseId?: string) {
  revalidatePath("/admin/wild-apricot");
  if (courseId) {
    revalidatePath(`/courses/${courseId}/settings`);
    revalidatePath(`/courses/${courseId}/people`);
  }
}
