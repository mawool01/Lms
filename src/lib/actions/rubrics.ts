"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { canEditRubric } from "@/lib/rubric-access";
import { blankCriterion, rubricCriteriaSchema, type RubricCriterion } from "@/lib/rubrics";
import type { ActionResult } from "@/lib/action-types";

const requireStaff = () => requireRole("ADMIN", "TEACHER");

async function editableRubric(rubricId: string) {
  const user = await requireStaff();
  const rubric = await db.rubric.findUnique({ where: { id: rubricId } });
  if (!rubric || !canEditRubric(user, rubric)) notFound();
  return { user, rubric };
}

export async function createRubric() {
  const user = await requireStaff();
  const rubric = await db.rubric.create({
    data: { ownerId: user.id, title: "Untitled rubric", criteria: [blankCriterion(), blankCriterion(), blankCriterion()] },
  });
  redirect(`/rubrics/${rubric.id}/edit`);
}

export type RubricDraft = { title: string; description: string; criteria: RubricCriterion[] };

export async function saveRubric(rubricId: string, draft: RubricDraft): Promise<ActionResult> {
  await editableRubric(rubricId);
  const title = String(draft.title ?? "").trim().slice(0, 200);
  if (!title) return { error: "Give the rubric a title." };
  const parsed = rubricCriteriaSchema.safeParse(draft.criteria);
  if (!parsed.success) return { error: "Each criterion needs between 1 and 10 levels with points from 0 to 1000." };
  const criteria = parsed.data;
  if (!criteria.length) return { error: "Add at least one criterion." };
  const untitled = criteria.findIndex((c) => !c.title);
  if (untitled >= 0) return { error: `Criterion ${untitled + 1} needs a title.` };
  for (const [i, c] of criteria.entries()) {
    if (c.levels.some((l) => !l.label)) return { error: `Every level in criterion ${i + 1} (“${c.title}”) needs a label.` };
  }
  await db.rubric.update({ where: { id: rubricId }, data: { title, description: String(draft.description ?? "").trim().slice(0, 2000), criteria } });
  revalidatePath("/rubrics");
  return { ok: "Rubric saved." };
}

export async function duplicateRubric(rubricId: string) {
  const user = await requireStaff();
  const source = await db.rubric.findUnique({ where: { id: rubricId } });
  if (!source || !(canEditRubric(user, source) || source.shared)) notFound();
  const copy = await db.rubric.create({
    data: { ownerId: user.id, title: `${source.title} (copy)`, description: source.description, criteria: source.criteria ?? [] },
  });
  redirect(`/rubrics/${copy.id}/edit`);
}

export async function deleteRubric(rubricId: string) {
  await editableRubric(rubricId);
  // Grades already given keep their rubric snapshot; attached assignments/questions are detached (SetNull).
  await db.rubric.delete({ where: { id: rubricId } });
  revalidatePath("/rubrics");
  redirect("/rubrics");
}

export async function setRubricShared(rubricId: string, shared: boolean) {
  await requireRole("ADMIN");
  await db.rubric.update({ where: { id: rubricId }, data: { shared } });
  revalidatePath("/rubrics", "layout");
}
