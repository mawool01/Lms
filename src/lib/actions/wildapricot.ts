"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireRole, requireUser } from "@/lib/auth";
import { requireCourseManager } from "@/lib/permissions";
import type { WaLinkKind } from "@prisma/client";
import { WaError, waAdminEnabled } from "@/lib/wildapricot";
import { waGetEvent, waGetMemberGroup, waGetMembershipLevel } from "@/lib/wildapricot-admin";
import { type WaSyncResult, syncWaEnrollments, waSyncSummary } from "@/lib/wildapricot-sync";
import type { ActionResult } from "@/lib/action-types";

const KIND_NOUNS: Record<WaLinkKind, string> = { EVENT: "event", GROUP: "member group", LEVEL: "membership level" };

/** Confirms the thing exists in Wild Apricot and returns what we store about it. */
async function describe(kind: WaLinkKind, waId: number) {
  if (kind === "GROUP") {
    const g = await waGetMemberGroup(waId);
    return g && { name: g.name, startsAt: null, endsAt: null };
  }
  if (kind === "LEVEL") {
    const l = await waGetMembershipLevel(waId);
    return l && { name: l.name, startsAt: null, endsAt: null };
  }
  const e = await waGetEvent(waId);
  return e && { name: e.name, startsAt: e.startDate, endsAt: e.endDate };
}

/**
 * Links a Wild Apricot event, member group or membership level to a course,
 * then syncs so the effect is visible immediately.
 */
export async function linkCourseWaLink(
  courseId: string,
  kind: WaLinkKind,
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  await requireCourseManager(user, courseId);
  if (!waAdminEnabled()) return { error: "Wild Apricot sync isn't configured." };

  // Accept a bare id or a pasted Wild Apricot URL ending in the id.
  const raw = String(formData.get("waId") ?? "").trim();
  const waId = Number(raw.match(/(\d{3,})\s*$/)?.[1] ?? raw);
  if (!Number.isInteger(waId) || waId <= 0) {
    return { error: `Enter the Wild Apricot ${KIND_NOUNS[kind]} id (the number at the end of its web address).` };
  }

  let found;
  try {
    found = await describe(kind, waId);
  } catch (e) {
    return { error: e instanceof WaError ? e.message : "Couldn't reach Wild Apricot. Please try again." };
  }
  if (!found) return { error: `Wild Apricot has no ${KIND_NOUNS[kind]} ${waId}. Check the id and try again.` };

  const existing = await db.courseWaLink.findUnique({ where: { courseId_kind_waId: { courseId, kind, waId } } });
  if (existing) return { error: `“${found.name}” is already linked to this course.` };

  await db.courseWaLink.create({
    data: { courseId, kind, waId, name: found.name, startsAt: found.startsAt, endsAt: found.endsAt, addedById: user.id },
  });

  const result = await syncWaEnrollments({ trigger: "ADMIN", courseId });
  revalidateWa(courseId);
  return { ok: `Linked “${found.name}”. ${waSyncSummary(result)}` };
}

export async function unlinkCourseWaLink(linkId: string): Promise<void> {
  const user = await requireUser();
  const link = await db.courseWaLink.findUnique({ where: { id: linkId }, select: { courseId: true } });
  if (!link) return;
  await requireCourseManager(user, link.courseId);
  // Enrollments stay, with waLinkId set to null by the FK — taking the link away
  // shouldn't take away access someone already has.
  await db.courseWaLink.delete({ where: { id: linkId } });
  revalidateWa(link.courseId);
}

/** Flips one of the two per-link switches: `active` (keep syncing) or `revoke` (mirror removals). */
export async function toggleCourseWaLink(linkId: string, field: "active" | "revoke"): Promise<void> {
  const user = await requireUser();
  const link = await db.courseWaLink.findUnique({ where: { id: linkId }, select: { courseId: true, active: true, revoke: true } });
  if (!link) return;
  await requireCourseManager(user, link.courseId);
  await db.courseWaLink.update({
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
