"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { checkProblem, isCorrect, type CheckResult } from "@/lib/knowledge-check";
import { db } from "@/lib/db";
import { requireRole, requireUser } from "@/lib/auth";
import { getCourseAccess, requireCourseManager, requireCourseMember } from "@/lib/permissions";
import { blocksSchema, isSafeUrl, parseBlocks } from "@/lib/blocks";
import { onLessonCompleted } from "@/lib/gamification";
import { orderUpdates } from "@/lib/reorder";
import type { ActionResult } from "@/lib/action-types";

const optionalUrl = z
  .string()
  .trim()
  .transform((v) => v || null)
  .refine((v) => v === null || isSafeUrl(v), "Please enter a valid http(s) URL.");

const courseSchema = z.object({
  title: z.string().trim().min(3, "Title must be at least 3 characters."),
  code: z
    .string()
    .trim()
    .min(2, "Course code is required.")
    .max(20)
    .transform((v) => v.toUpperCase()),
  description: z.string().trim().default(""),
  category: z.string().trim().default("General"),
  coverUrl: optionalUrl,
  meetingUrl: optionalUrl,
});

function readCourse(formData: FormData) {
  return courseSchema.safeParse({
    title: formData.get("title") ?? "",
    code: formData.get("code") ?? "",
    description: formData.get("description") ?? "",
    category: formData.get("category") || "General",
    coverUrl: formData.get("coverUrl") ?? "",
    meetingUrl: formData.get("meetingUrl") ?? "",
  });
}

export async function createCourse(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireRole("TEACHER", "ADMIN");
  const parsed = readCourse(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  if (await db.course.findUnique({ where: { code: parsed.data.code } })) return { error: "That course code is already in use." };
  const course = await db.course.create({
    data: {
      ...parsed.data,
      teacherId: user.id,
      modules: { create: { title: "Getting started", position: 0 } },
    },
  });
  redirect(`/courses/${course.id}`);
}

export async function updateCourse(courseId: string, _prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  await requireCourseManager(user, courseId);
  const parsed = readCourse(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const clash = await db.course.findFirst({ where: { code: parsed.data.code, NOT: { id: courseId } } });
  if (clash) return { error: "That course code is already in use." };
  const teacherId = formData.get("teacherId");
  const data: Record<string, unknown> = { ...parsed.data, published: formData.get("published") === "on" };
  if (user.role === "ADMIN" && typeof teacherId === "string" && teacherId) data.teacherId = teacherId;
  await db.course.update({ where: { id: courseId }, data });
  revalidatePath(`/courses/${courseId}`, "layout");
  return { ok: "Course saved." };
}

export async function deleteCourse(courseId: string) {
  const user = await requireUser();
  await requireCourseManager(user, courseId);
  await db.course.delete({ where: { id: courseId } });
  redirect("/courses");
}

export async function enroll(courseId: string) {
  const user = await requireUser();
  const { course } = await getCourseAccess(user, courseId);
  if (!course.published) return;
  await db.enrollment.upsert({
    where: { userId_courseId: { userId: user.id, courseId } },
    update: {},
    create: { userId: user.id, courseId },
  });
  redirect(`/courses/${courseId}`);
}

export async function unenroll(courseId: string) {
  const user = await requireUser();
  await db.enrollment.deleteMany({ where: { userId: user.id, courseId } });
  redirect("/courses");
}

export async function addStudents(courseId: string, _prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  await requireCourseManager(user, courseId);
  const emails = String(formData.get("emails") ?? "")
    .split(/[\s,;]+/)
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (!emails.length) return { error: "Enter at least one email address." };
  const users = await db.user.findMany({ where: { email: { in: emails } } });
  for (const u of users) {
    await db.enrollment.upsert({
      where: { userId_courseId: { userId: u.id, courseId } },
      update: {},
      create: { userId: u.id, courseId },
    });
  }
  const missing = emails.filter((e) => !users.some((u) => u.email === e));
  revalidatePath(`/courses/${courseId}/people`);
  if (missing.length) return { error: `Enrolled ${users.length}. No account found for: ${missing.join(", ")}` };
  return { ok: `Enrolled ${users.length} ${users.length === 1 ? "person" : "people"}.` };
}

export async function removeStudent(courseId: string, userId: string) {
  const user = await requireUser();
  await requireCourseManager(user, courseId);
  await db.enrollment.deleteMany({ where: { userId, courseId } });
  revalidatePath(`/courses/${courseId}/people`);
}

// ─── Modules & lessons ───────────────────────────────────────────────────────

export async function createModule(courseId: string, _prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  await requireCourseManager(user, courseId);
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return { error: "Module title is required." };
  const count = await db.module.count({ where: { courseId } });
  await db.module.create({ data: { courseId, title, position: count } });
  revalidatePath(`/courses/${courseId}`);
  return { ok: "Module added." };
}

export async function renameModule(moduleId: string, formData: FormData) {
  const user = await requireUser();
  const mod = await db.module.findUniqueOrThrow({ where: { id: moduleId } });
  await requireCourseManager(user, mod.courseId);
  const title = String(formData.get("title") ?? "").trim();
  if (title) await db.module.update({ where: { id: moduleId }, data: { title } });
  revalidatePath(`/courses/${mod.courseId}`);
}

export async function deleteModule(moduleId: string) {
  const user = await requireUser();
  const mod = await db.module.findUniqueOrThrow({ where: { id: moduleId } });
  await requireCourseManager(user, mod.courseId);
  await db.module.delete({ where: { id: moduleId } });
  revalidatePath(`/courses/${mod.courseId}`);
}

export async function moveModule(moduleId: string, direction: -1 | 1) {
  const user = await requireUser();
  const mod = await db.module.findUniqueOrThrow({ where: { id: moduleId } });
  await requireCourseManager(user, mod.courseId);
  const siblings = await db.module.findMany({ where: { courseId: mod.courseId }, orderBy: [{ position: "asc" }, { id: "asc" }] });
  await reorder(siblings, moduleId, direction, (id, position) => db.module.update({ where: { id }, data: { position } }));
  revalidatePath(`/courses/${mod.courseId}`);
}

/** Drag-to-reorder: `ids` is the course's whole module list, in its new order. */
export async function reorderModules(courseId: string, ids: string[]) {
  const user = await requireUser();
  await requireCourseManager(user, courseId);
  const siblings = await db.module.findMany({ where: { courseId }, orderBy: [{ position: "asc" }, { id: "asc" }], select: { id: true } });
  const updates = orderUpdates(siblings, ids);
  if (!updates?.length) return;
  await db.$transaction(updates.map((u) => db.module.update({ where: { id: u.id }, data: { position: u.position } })));
  revalidatePath(`/courses/${courseId}`);
}

export async function createLesson(moduleId: string, _prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const mod = await db.module.findUniqueOrThrow({ where: { id: moduleId } });
  await requireCourseManager(user, mod.courseId);
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return { error: "Lesson title is required." };
  const count = await db.lesson.count({ where: { moduleId } });
  const lesson = await db.lesson.create({
    data: { moduleId, title, position: count, blocks: [{ id: crypto.randomUUID(), type: "text", markdown: "" }] },
  });
  redirect(`/courses/${mod.courseId}/lessons/${lesson.id}/edit`);
}

export async function saveLesson(lessonId: string, input: { title: string; points: number; blocks: unknown }): Promise<ActionResult> {
  const user = await requireUser();
  const lesson = await db.lesson.findUniqueOrThrow({ where: { id: lessonId }, include: { module: true } });
  await requireCourseManager(user, lesson.module.courseId);
  const blocks = blocksSchema.safeParse(input.blocks);
  if (!blocks.success) return { error: "Some content blocks are invalid." };
  for (const b of blocks.data) {
    if ("url" in b && b.url && !isSafeUrl(b.url)) return { error: `Invalid URL in ${b.type} block: ${b.url}` };
    if (b.type === "check") {
      const problem = checkProblem(b);
      if (problem) return { error: problem };
    }
  }
  const title = input.title.trim();
  if (!title) return { error: "Lesson title is required." };
  await db.lesson.update({
    where: { id: lessonId },
    data: { title, points: Math.max(0, Math.min(1000, Math.round(input.points) || 0)), blocks: blocks.data },
  });
  revalidatePath(`/courses/${lesson.module.courseId}`, "layout");
  return { ok: "Lesson saved." };
}

export async function deleteLesson(lessonId: string) {
  const user = await requireUser();
  const lesson = await db.lesson.findUniqueOrThrow({ where: { id: lessonId }, include: { module: true } });
  await requireCourseManager(user, lesson.module.courseId);
  await db.lesson.delete({ where: { id: lessonId } });
  redirect(`/courses/${lesson.module.courseId}`);
}

export async function moveLesson(lessonId: string, direction: -1 | 1) {
  const user = await requireUser();
  const lesson = await db.lesson.findUniqueOrThrow({ where: { id: lessonId }, include: { module: true } });
  await requireCourseManager(user, lesson.module.courseId);
  const siblings = await db.lesson.findMany({ where: { moduleId: lesson.moduleId }, orderBy: [{ position: "asc" }, { id: "asc" }] });
  await reorder(siblings, lessonId, direction, (id, position) => db.lesson.update({ where: { id }, data: { position } }));
  revalidatePath(`/courses/${lesson.module.courseId}`);
}

/** Drag-to-reorder: `ids` is the module's whole lesson list, in its new order. */
export async function reorderLessons(moduleId: string, ids: string[]) {
  const user = await requireUser();
  const mod = await db.module.findUniqueOrThrow({ where: { id: moduleId } });
  await requireCourseManager(user, mod.courseId);
  const siblings = await db.lesson.findMany({ where: { moduleId }, orderBy: [{ position: "asc" }, { id: "asc" }], select: { id: true } });
  const updates = orderUpdates(siblings, ids);
  if (!updates?.length) return;
  await db.$transaction(updates.map((u) => db.lesson.update({ where: { id: u.id }, data: { position: u.position } })));
  revalidatePath(`/courses/${mod.courseId}`);
}

async function reorder<T extends { id: string }>(items: T[], id: string, direction: -1 | 1, save: (id: string, position: number) => Promise<unknown>) {
  const index = items.findIndex((i) => i.id === id);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= items.length) return;
  const ordered = [...items];
  [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
  for (const [position, item] of ordered.entries()) await save(item.id, position);
}

export async function toggleLessonComplete(lessonId: string) {
  const user = await requireUser();
  const lesson = await db.lesson.findUniqueOrThrow({ where: { id: lessonId }, include: { module: true } });
  const { isEnrolled } = await requireCourseMember(user, lesson.module.courseId);
  if (!isEnrolled) return;
  const existing = await db.lessonCompletion.findUnique({ where: { userId_lessonId: { userId: user.id, lessonId } } });
  if (existing) {
    await db.lessonCompletion.delete({ where: { id: existing.id } });
  } else {
    await db.lessonCompletion.create({ data: { userId: user.id, lessonId } });
    await onLessonCompleted(user.id, lessonId);
  }
  revalidatePath(`/courses/${lesson.module.courseId}`, "layout");
}

// ─── Announcements ───────────────────────────────────────────────────────────

export async function postAnnouncement(courseId: string, _prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  await requireCourseManager(user, courseId);
  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  if (!title || !body) return { error: "Title and message are required." };
  await db.announcement.create({ data: { courseId, authorId: user.id, title, body } });
  revalidatePath(`/courses/${courseId}`);
  return { ok: "Announcement posted." };
}

export async function deleteAnnouncement(id: string) {
  const user = await requireUser();
  const a = await db.announcement.findUniqueOrThrow({ where: { id } });
  await requireCourseManager(user, a.courseId);
  await db.announcement.delete({ where: { id } });
  revalidatePath(`/courses/${a.courseId}`);
}

// ─── Knowledge checks ────────────────────────────────────────────────────────

/** Checks one practice answer. Enrolled learners' answers are recorded for the teacher's class results. */
export async function answerKnowledgeCheck(lessonId: string, blockId: string, questionId: string, value: string): Promise<CheckResult | { error: string }> {
  const user = await requireUser();
  const lesson = await db.lesson.findUnique({ where: { id: lessonId }, include: { module: { select: { courseId: true } } } });
  if (!lesson) return { error: "Lesson not found." };
  const { isEnrolled } = await requireCourseMember(user, lesson.module.courseId);
  const block = parseBlocks(lesson.blocks).find((b) => b.id === blockId);
  const question = block?.type === "check" ? block.questions.find((q) => q.id === questionId) : undefined;
  if (!question) return { error: "This question was changed. Reload the page to see the latest version." };
  const answer = String(value ?? "").slice(0, 1000);
  const correct = isCorrect(question, answer);
  if (isEnrolled) {
    await db.knowledgeCheckResponse.upsert({
      where: { userId_lessonId_questionId: { userId: user.id, lessonId, questionId } },
      create: { userId: user.id, lessonId, blockId, questionId, attempts: 1, firstTryCorrect: correct, correct, lastAnswer: answer },
      update: { attempts: { increment: 1 }, correct, lastAnswer: answer, blockId },
    });
  }
  return { correct, explanation: question.explanation };
}

/** Forgets a learner's answers to one knowledge check so they can start over (first-try results are kept for teachers). */
export async function resetKnowledgeCheck(lessonId: string, blockId: string) {
  const user = await requireUser();
  await db.knowledgeCheckResponse.updateMany({ where: { userId: user.id, lessonId, blockId }, data: { lastAnswer: "" } });
}
