"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { Prisma, type QuestionType } from "@prisma/client";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { requireCourseManager, requireCourseMember } from "@/lib/permissions";
import { awardBadge, awardPoints, POINTS } from "@/lib/gamification";
import { isSafeUrl } from "@/lib/blocks";
import { parseDateInput } from "@/lib/utils";
import { loadRubric, readRubricChoice } from "@/lib/rubric-access";
import { readRubricScores, type RubricScores } from "@/lib/rubrics";
import type { ActionResult } from "@/lib/action-types";

// ─── Quizzes ─────────────────────────────────────────────────────────────────

const quizSchema = z.object({
  title: z.string().trim().min(1, "Title is required."),
  description: z.string().trim().default(""),
  passingScore: z.coerce.number().int().min(0).max(100),
  maxAttempts: z.coerce.number().int().min(0).max(100),
  weight: z.coerce.number().int().min(0).max(1000),
});

function readQuiz(formData: FormData) {
  return quizSchema.safeParse({
    title: formData.get("title") ?? "",
    description: formData.get("description") ?? "",
    passingScore: formData.get("passingScore") || 70,
    maxAttempts: formData.get("maxAttempts") || 0,
    weight: formData.get("weight") || 10,
  });
}

export async function createQuiz(courseId: string, _prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  await requireCourseManager(user, courseId);
  const parsed = readQuiz(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const quiz = await db.quiz.create({ data: { ...parsed.data, courseId, dueAt: parseDateInput(formData.get("dueAt")) } });
  redirect(`/courses/${courseId}/quizzes/${quiz.id}/edit`);
}

async function managedQuiz(quizId: string) {
  const user = await requireUser();
  const quiz = await db.quiz.findUniqueOrThrow({ where: { id: quizId } });
  await requireCourseManager(user, quiz.courseId);
  return quiz;
}

export async function updateQuiz(quizId: string, _prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const quiz = await managedQuiz(quizId);
  const parsed = readQuiz(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const published = formData.get("published") === "on";
  if (published && (await db.question.count({ where: { quizId } })) === 0) return { error: "Add at least one question before publishing." };
  await db.quiz.update({ where: { id: quizId }, data: { ...parsed.data, published, dueAt: parseDateInput(formData.get("dueAt")) } });
  revalidatePath(`/courses/${quiz.courseId}/quizzes`, "layout");
  return { ok: "Quiz settings saved." };
}

export async function deleteQuiz(quizId: string) {
  const quiz = await managedQuiz(quizId);
  await db.quiz.delete({ where: { id: quizId } });
  redirect(`/courses/${quiz.courseId}/quizzes`);
}

function readQuestion(formData: FormData): { error: string } | { data: { type: QuestionType; prompt: string; options: string[]; answer: string; points: number } } {
  const type = String(formData.get("type")) as QuestionType;
  const prompt = String(formData.get("prompt") ?? "").trim();
  const points = Math.max(1, Math.min(type === "ESSAY" ? 1000 : 100, Number(formData.get("points")) || 1));
  if (!prompt) return { error: "Question text is required." };
  if (type === "MULTIPLE_CHOICE") {
    const options = formData.getAll("option").map((o) => String(o).trim());
    const correct = Number(formData.get("correct"));
    const kept = options.map((text, i) => ({ text, i })).filter((o) => o.text);
    if (kept.length < 2) return { error: "Provide at least two answer choices." };
    const correctIndex = kept.findIndex((o) => o.i === correct);
    if (correctIndex < 0) return { error: "Select which choice is correct." };
    return { data: { type, prompt, options: kept.map((o) => o.text), answer: String(correctIndex), points } };
  }
  if (type === "TRUE_FALSE") {
    const answer = String(formData.get("tf"));
    if (answer !== "true" && answer !== "false") return { error: "Choose True or False as the correct answer." };
    return { data: { type, prompt, options: [], answer, points } };
  }
  if (type === "SHORT_ANSWER") {
    const answer = String(formData.get("accepted") ?? "")
      .split("|")
      .map((a) => a.trim())
      .filter(Boolean)
      .join("|");
    if (!answer) return { error: "Enter at least one accepted answer." };
    return { data: { type, prompt, options: [], answer, points } };
  }
  if (type === "ESSAY") {
    return { data: { type, prompt, options: [], answer: String(formData.get("guidance") ?? "").trim().slice(0, 500), points } };
  }
  return { error: "Unknown question type." };
}

/** Essays may carry a rubric; other types never do. */
async function questionRubric(type: QuestionType, formData: FormData, currentId?: string | null) {
  if (type !== "ESSAY") return null;
  return readRubricChoice(await requireUser(), formData.get("rubricId"), currentId);
}

export async function addQuestion(quizId: string, _prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const quiz = await managedQuiz(quizId);
  const q = readQuestion(formData);
  if ("error" in q) return { error: q.error };
  const rubricId = await questionRubric(q.data.type, formData);
  if (rubricId === undefined) return { error: "You can't use that rubric." };
  const position = await db.question.count({ where: { quizId } });
  await db.question.create({ data: { ...q.data, rubricId, quizId, position } });
  revalidatePath(`/courses/${quiz.courseId}/quizzes/${quizId}/edit`);
  return { ok: "Question added." };
}

export async function updateQuestion(questionId: string, _prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const question = await db.question.findUniqueOrThrow({ where: { id: questionId } });
  const quiz = await managedQuiz(question.quizId);
  const q = readQuestion(formData);
  if ("error" in q) return { error: q.error };
  const rubricId = await questionRubric(q.data.type, formData, question.rubricId);
  if (rubricId === undefined) return { error: "You can't use that rubric." };
  await db.question.update({ where: { id: questionId }, data: { ...q.data, rubricId } });
  revalidatePath(`/courses/${quiz.courseId}/quizzes/${quiz.id}/edit`);
  return { ok: "Question updated." };
}

export async function deleteQuestion(questionId: string) {
  const question = await db.question.findUniqueOrThrow({ where: { id: questionId } });
  const quiz = await managedQuiz(question.quizId);
  await db.question.delete({ where: { id: questionId } });
  revalidatePath(`/courses/${quiz.courseId}/quizzes/${quiz.id}/edit`);
}

const normalize = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/**
 * One answer in an attempt. Essays start ungraded (`graded: false`, earned 0) until a teacher scores them;
 * they then carry `feedback` and, when a rubric was used, `rubricScores`.
 */
export type AttemptAnswer = { value: string; correct: boolean; earned: number; graded?: boolean; feedback?: string | null; rubricScores?: RubricScores | null };

async function awardQuizResult(userId: string, quiz: { id: string; title: string; courseId: string }, passed: boolean, percent: number) {
  if (passed) await awardPoints(userId, POINTS.quizPass, `Passed quiz “${quiz.title}”`, `quiz-pass:${quiz.id}`, quiz.courseId);
  if (percent === 100) {
    await awardPoints(userId, POINTS.quizPerfect, `Perfect score on “${quiz.title}”`, `quiz-perfect:${quiz.id}`, quiz.courseId);
    await awardBadge(userId, "quiz-whiz");
  }
}

const toPercent = (score: number, max: number) => (max ? Math.round((score / max) * 1000) / 10 : 0);

export async function submitQuiz(quizId: string, formData: FormData) {
  const user = await requireUser();
  const quiz = await db.quiz.findUniqueOrThrow({ where: { id: quizId }, include: { questions: true } });
  const { isEnrolled } = await requireCourseMember(user, quiz.courseId);
  if (!isEnrolled || !quiz.published) redirect(`/courses/${quiz.courseId}/quizzes/${quizId}`);
  const used = await db.quizAttempt.count({ where: { quizId, userId: user.id } });
  if (quiz.maxAttempts > 0 && used >= quiz.maxAttempts) redirect(`/courses/${quiz.courseId}/quizzes/${quizId}`);

  const answers: Record<string, AttemptAnswer> = {};
  let score = 0;
  let maxScore = 0;
  let needsGrading = false;
  for (const q of quiz.questions) {
    maxScore += q.points;
    if (q.type === "ESSAY") {
      answers[q.id] = { value: String(formData.get(`q_${q.id}`) ?? "").slice(0, 50000), correct: false, earned: 0, graded: false };
      needsGrading = true;
      continue;
    }
    const value = String(formData.get(`q_${q.id}`) ?? "");
    const correct =
      q.type === "SHORT_ANSWER" ? q.answer.split("|").some((a) => normalize(a) === normalize(value)) && value.trim() !== "" : value === q.answer;
    const earned = correct ? q.points : 0;
    answers[q.id] = { value, correct, earned };
    score += earned;
  }
  // With essays still to grade the score is provisional, and the attempt can't pass yet.
  const percent = toPercent(score, maxScore);
  const passed = !needsGrading && percent >= quiz.passingScore;
  const attempt = await db.quizAttempt.create({ data: { quizId, userId: user.id, answers, score, maxScore, percent, passed, needsGrading } });

  if (!needsGrading) await awardQuizResult(user.id, quiz, passed, percent);
  redirect(`/courses/${quiz.courseId}/quizzes/${quizId}/attempts/${attempt.id}`);
}

/** Teacher scores the essay answers in an attempt (optionally with each question's rubric); completes the grade. */
export async function gradeEssayAnswers(attemptId: string, _prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const attempt = await db.quizAttempt.findUniqueOrThrow({ where: { id: attemptId }, include: { quiz: { include: { questions: true } } } });
  await managedQuiz(attempt.quizId);
  const answers = { ...(attempt.answers as Record<string, AttemptAnswer>) };
  const essays = attempt.quiz.questions.filter((q) => q.type === "ESSAY");
  if (!essays.length) return { error: "This attempt has no essay questions." };

  for (const q of essays) {
    const raw = String(formData.get(`points_${q.id}`) ?? "").trim();
    const points = Number(raw);
    if (raw === "" || !Number.isFinite(points) || points < 0 || points > q.points) return { error: `Give a score between 0 and ${q.points} for every essay.` };
    let rubricScores: RubricScores | null = null;
    const rubric = await loadRubric(q.rubricId);
    if (rubric) {
      const read = readRubricScores(String(formData.get(`rubric_${q.id}`) ?? ""), rubric);
      if (read && "error" in read) return { error: read.error };
      rubricScores = read;
    }
    const earned = Math.round(points * 10) / 10;
    answers[q.id] = {
      value: answers[q.id]?.value ?? "",
      earned,
      correct: earned >= q.points / 2,
      graded: true,
      feedback: String(formData.get(`feedback_${q.id}`) ?? "").trim().slice(0, 5000) || null,
      rubricScores,
    };
  }

  // Questions added after the attempt don't count; recompute from what was answered.
  const counted = attempt.quiz.questions.filter((q) => answers[q.id]);
  const score = Math.round(counted.reduce((s, q) => s + (answers[q.id].earned ?? 0), 0) * 10) / 10;
  const maxScore = counted.reduce((s, q) => s + q.points, 0);
  const percent = toPercent(score, maxScore);
  const passed = percent >= attempt.quiz.passingScore;
  await db.quizAttempt.update({
    where: { id: attemptId },
    data: { answers, score: Math.round(score), maxScore, percent, passed, needsGrading: false, gradedAt: new Date() },
  });
  await awardQuizResult(attempt.userId, attempt.quiz, passed, percent);
  revalidatePath(`/courses/${attempt.quiz.courseId}`, "layout");
  return { ok: attempt.needsGrading ? "Essay graded — the student can now see their score." : "Grade updated." };
}

// ─── Assignments ─────────────────────────────────────────────────────────────

const assignmentSchema = z.object({
  title: z.string().trim().min(1, "Title is required."),
  description: z.string().trim().default(""),
  maxPoints: z.coerce.number().int().min(1).max(10000),
  weight: z.coerce.number().int().min(0).max(1000),
});

function readAssignment(formData: FormData) {
  return assignmentSchema.safeParse({
    title: formData.get("title") ?? "",
    description: formData.get("description") ?? "",
    maxPoints: formData.get("maxPoints") || 100,
    weight: formData.get("weight") || 20,
  });
}

export async function createAssignment(courseId: string, _prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  await requireCourseManager(user, courseId);
  const parsed = readAssignment(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const rubricId = await readRubricChoice(user, formData.get("rubricId"));
  if (rubricId === undefined) return { error: "You can't use that rubric." };
  const assignment = await db.assignment.create({
    data: { ...parsed.data, courseId, rubricId, dueAt: parseDateInput(formData.get("dueAt")), published: formData.get("published") === "on" },
  });
  redirect(`/courses/${courseId}/assignments/${assignment.id}`);
}

async function managedAssignment(assignmentId: string) {
  const user = await requireUser();
  const assignment = await db.assignment.findUniqueOrThrow({ where: { id: assignmentId } });
  await requireCourseManager(user, assignment.courseId);
  return { user, assignment };
}

export async function updateAssignment(assignmentId: string, _prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const { user, assignment } = await managedAssignment(assignmentId);
  const parsed = readAssignment(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const rubricId = await readRubricChoice(user, formData.get("rubricId"), assignment.rubricId);
  if (rubricId === undefined) return { error: "You can't use that rubric." };
  await db.assignment.update({
    where: { id: assignmentId },
    data: { ...parsed.data, rubricId, dueAt: parseDateInput(formData.get("dueAt")), published: formData.get("published") === "on" },
  });
  revalidatePath(`/courses/${assignment.courseId}/assignments`, "layout");
  return { ok: "Assignment saved." };
}

export async function deleteAssignment(assignmentId: string) {
  const { assignment } = await managedAssignment(assignmentId);
  await db.assignment.delete({ where: { id: assignmentId } });
  redirect(`/courses/${assignment.courseId}/assignments`);
}

const MAX_SUBMISSION_FILES = 10;

/** Accepts only files this student uploaded to the submissions folder (Blob URL or /files/ path). */
function isOwnSubmissionFile(url: string, userId: string) {
  if (!isSafeUrl(url)) return false;
  const { hostname, pathname } = new URL(url);
  const path = decodeURIComponent(pathname);
  if (hostname.endsWith(".blob.vercel-storage.com")) return path.startsWith(`/submissions/${userId}/`);
  return path.startsWith(`/files/submissions/${userId}/`);
}

export async function submitAssignment(assignmentId: string, _prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const assignment = await db.assignment.findUniqueOrThrow({ where: { id: assignmentId } });
  const { isEnrolled } = await requireCourseMember(user, assignment.courseId);
  if (!isEnrolled || !assignment.published) return { error: "You can't submit to this assignment." };
  const content = String(formData.get("content") ?? "").trim();
  const linkUrl = String(formData.get("linkUrl") ?? "").trim() || null;
  const files = [...new Set(formData.getAll("files").map((f) => String(f).trim()).filter(Boolean))];
  if (!content && !linkUrl && !files.length) return { error: "Write a response, attach a file or add a link." };
  if (linkUrl && !isSafeUrl(linkUrl)) return { error: "Please enter a valid http(s) link." };
  if (files.length > MAX_SUBMISSION_FILES) return { error: `You can attach up to ${MAX_SUBMISSION_FILES} files.` };
  if (files.some((f) => !isOwnSubmissionFile(f, user.id))) return { error: "One of the attached files couldn't be verified. Please upload it again." };
  const existing = await db.submission.findUnique({ where: { assignmentId_userId: { assignmentId, userId: user.id } } });
  if (existing?.grade != null) return { error: "This submission has already been graded." };
  await db.submission.upsert({
    where: { assignmentId_userId: { assignmentId, userId: user.id } },
    update: { content, linkUrl, files, submittedAt: new Date() },
    create: { assignmentId, userId: user.id, content, linkUrl, files },
  });
  await awardPoints(user.id, POINTS.assignmentSubmit, `Submitted “${assignment.title}”`, `assignment-submit:${assignmentId}`, assignment.courseId);
  if (assignment.dueAt && assignment.dueAt.getTime() - Date.now() >= 24 * 3600 * 1000) await awardBadge(user.id, "early-bird");
  revalidatePath(`/courses/${assignment.courseId}/assignments/${assignmentId}`);
  return { ok: existing ? "Submission updated." : "Submitted! +20 points" };
}

export async function gradeSubmission(submissionId: string, _prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const submission = await db.submission.findUniqueOrThrow({ where: { id: submissionId }, include: { assignment: true } });
  const { user } = await managedAssignment(submission.assignmentId);
  const raw = String(formData.get("grade") ?? "").trim();
  const grade = raw === "" ? null : Number(raw);
  if (grade !== null && (!Number.isFinite(grade) || grade < 0 || grade > submission.assignment.maxPoints)) {
    return { error: `Grade must be between 0 and ${submission.assignment.maxPoints}.` };
  }
  const feedback = String(formData.get("feedback") ?? "").trim() || null;
  const rubric = await loadRubric(submission.assignment.rubricId);
  let rubricScores: RubricScores | null = null;
  if (rubric) {
    const read = readRubricScores(String(formData.get("rubricScores") ?? ""), rubric);
    if (read && "error" in read) return { error: read.error };
    rubricScores = read;
  }
  await db.submission.update({
    where: { id: submissionId },
    data: {
      grade: grade === null ? null : Math.round(grade),
      feedback,
      rubricScores: rubricScores ?? Prisma.DbNull,
      gradedById: user.id,
      gradedAt: grade === null ? null : new Date(),
    },
  });
  if (grade !== null && grade / submission.assignment.maxPoints >= 0.9) {
    await awardPoints(submission.userId, POINTS.assignmentExcellent, `Excellent work on “${submission.assignment.title}”`, `assignment-excellent:${submission.assignmentId}`, submission.assignment.courseId);
  }
  revalidatePath(`/courses/${submission.assignment.courseId}`, "layout");
  return { ok: "Grade saved." };
}
