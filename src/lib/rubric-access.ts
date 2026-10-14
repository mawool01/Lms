import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "./db";
import type { CurrentUser } from "./auth";
import { toRubricData } from "./rubrics";

/** Rubrics a person may attach: their own plus site-wide shared ones (admins: all). */
export function usableRubricsWhere(user: CurrentUser): Prisma.RubricWhereInput {
  return user.role === "ADMIN" ? {} : { OR: [{ ownerId: user.id }, { shared: true }] };
}

export const canEditRubric = (user: CurrentUser, rubric: { ownerId: string }) => user.role === "ADMIN" || rubric.ownerId === user.id;

/** Options for a "Grading rubric" select. */
export async function rubricOptions(user: CurrentUser, includeId?: string | null) {
  const rubrics = await db.rubric.findMany({
    where: includeId ? { OR: [usableRubricsWhere(user), { id: includeId }] } : usableRubricsWhere(user),
    select: { id: true, title: true, shared: true, ownerId: true, owner: { select: { name: true } } },
    orderBy: { title: "asc" },
  });
  return rubrics.map((r) => ({ id: r.id, label: r.ownerId === user.id ? r.title : `${r.title} (${r.owner.name}${r.shared ? ", shared" : ""})` }));
}

/**
 * Reads a rubricId form field. Teachers may attach only rubrics they can use; an already-attached rubric may stay.
 * Returns undefined when the choice is not allowed.
 */
export async function readRubricChoice(user: CurrentUser, raw: FormDataEntryValue | null, currentId?: string | null) {
  const id = String(raw ?? "").trim();
  if (!id) return null;
  if (id === currentId) return id;
  const ok = await db.rubric.findFirst({ where: { AND: [{ id }, usableRubricsWhere(user)] }, select: { id: true } });
  return ok ? id : undefined;
}

export async function loadRubric(id: string | null | undefined) {
  if (!id) return null;
  const r = await db.rubric.findUnique({ where: { id } });
  return r ? toRubricData(r) : null;
}
