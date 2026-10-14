import "server-only";
import { db } from "./db";
import { isComplete, scormGrade } from "./scorm/status";

export type GradeItem = {
  id: string;
  kind: "quiz" | "assignment" | "scorm";
  title: string;
  weight: number;
  dueAt: Date | null;
  /** Percent 0–100, or null if not yet attempted / graded. */
  percent: number | null;
  status: "not-started" | "in-progress" | "submitted" | "graded";
};

export type StudentCourseReport = {
  userId: string;
  items: GradeItem[];
  /** Weighted average over graded items only. */
  grade: number | null;
  lessonsDone: number;
  lessonsTotal: number;
  progress: number;
  lastActive: Date | null;
};

/**
 * Builds a grade + progress report for every given student in a course
 * using a fixed number of queries (no N+1).
 */
export async function courseReports(courseId: string, userIds: string[]): Promise<Map<string, StudentCourseReport>> {
  const [quizzes, assignments, lessons, attempts, submissions, completions, posts, packages, scormAttempts] = await Promise.all([
    db.quiz.findMany({ where: { courseId, published: true }, orderBy: { createdAt: "asc" } }),
    db.assignment.findMany({ where: { courseId, published: true }, orderBy: { createdAt: "asc" } }),
    db.lesson.findMany({ where: { module: { courseId } }, select: { id: true } }),
    db.quizAttempt.findMany({
      where: { quiz: { courseId }, userId: { in: userIds } },
      select: { quizId: true, userId: true, percent: true, submittedAt: true, needsGrading: true },
    }),
    db.submission.findMany({
      where: { assignment: { courseId }, userId: { in: userIds } },
      select: { assignmentId: true, userId: true, grade: true, submittedAt: true },
    }),
    db.lessonCompletion.findMany({
      where: { lesson: { module: { courseId } }, userId: { in: userIds } },
      select: { userId: true, completedAt: true },
    }),
    db.forumPost.findMany({
      where: { thread: { courseId }, authorId: { in: userIds } },
      select: { authorId: true, createdAt: true },
    }),
    db.scormPackage.findMany({ where: { courseId, published: true }, orderBy: [{ position: "asc" }, { createdAt: "asc" }] }),
    db.scormAttempt.findMany({
      where: { package: { courseId, published: true }, userId: { in: userIds } },
      select: { packageId: true, userId: true, completionStatus: true, successStatus: true, percent: true, overridePercent: true, updatedAt: true },
    }),
  ]);

  const reports = new Map<string, StudentCourseReport>();
  for (const userId of userIds) {
    const items: GradeItem[] = [];
    for (const q of quizzes) {
      const mine = attempts.filter((a) => a.quizId === q.id && a.userId === userId);
      // Attempts with essays awaiting a teacher don't count until they're graded.
      const graded = mine.filter((a) => !a.needsGrading);
      const best = graded.length ? Math.max(...graded.map((a) => a.percent)) : null;
      const status = best !== null ? "graded" : mine.length ? "submitted" : "not-started";
      items.push({ id: q.id, kind: "quiz", title: q.title, weight: q.weight, dueAt: q.dueAt, percent: best, status });
    }
    for (const a of assignments) {
      const sub = submissions.find((s) => s.assignmentId === a.id && s.userId === userId);
      const percent = sub?.grade != null ? Math.round((sub.grade / a.maxPoints) * 1000) / 10 : null;
      items.push({
        id: a.id,
        kind: "assignment",
        title: a.title,
        weight: a.weight,
        dueAt: a.dueAt,
        percent,
        status: !sub ? "not-started" : sub.grade == null ? "submitted" : "graded",
      });
    }
    for (const p of packages) {
      const attempt = scormAttempts.find((a) => a.packageId === p.id && a.userId === userId);
      const percent = scormGrade(p, attempt);
      items.push({
        id: p.id,
        kind: "scorm",
        title: p.title,
        weight: p.weight,
        dueAt: null,
        percent,
        status: percent !== null ? "graded" : attempt && attempt.completionStatus !== "not attempted" ? "in-progress" : "not-started",
      });
    }
    const graded = items.filter((i) => i.percent !== null);
    const weightSum = graded.reduce((s, i) => s + i.weight, 0);
    const grade = weightSum > 0 ? Math.round((graded.reduce((s, i) => s + i.percent! * i.weight, 0) / weightSum) * 10) / 10 : null;

    const myCompletions = completions.filter((c) => c.userId === userId);
    const myScorm = scormAttempts.filter((a) => a.userId === userId);
    const scormDone = myScorm.filter(isComplete).length;
    const activity = [
      ...myCompletions.map((c) => c.completedAt),
      ...attempts.filter((a) => a.userId === userId).map((a) => a.submittedAt),
      ...submissions.filter((s) => s.userId === userId).map((s) => s.submittedAt),
      ...posts.filter((p) => p.authorId === userId).map((p) => p.createdAt),
      ...myScorm.map((a) => a.updatedAt),
    ];
    const lastActive = activity.length ? new Date(Math.max(...activity.map((d) => d.getTime()))) : null;

    reports.set(userId, {
      userId,
      items,
      grade,
      lessonsDone: myCompletions.length + scormDone,
      lessonsTotal: lessons.length + packages.length,
      progress: lessons.length + packages.length ? Math.round(((myCompletions.length + scormDone) / (lessons.length + packages.length)) * 100) : 0,
      lastActive,
    });
  }
  return reports;
}

export async function studentCourseReport(courseId: string, userId: string) {
  return (await courseReports(courseId, [userId])).get(userId)!;
}

/** Lesson progress for a user across many courses (used on dashboards). */
export async function progressByCourse(userId: string, courseIds: string[]) {
  const [totals, done, packages, scormDone] = await Promise.all([
    db.lesson.findMany({ where: { module: { courseId: { in: courseIds } } }, select: { module: { select: { courseId: true } } } }),
    db.lessonCompletion.findMany({
      where: { userId, lesson: { module: { courseId: { in: courseIds } } } },
      select: { lesson: { select: { module: { select: { courseId: true } } } } },
    }),
    db.scormPackage.findMany({ where: { courseId: { in: courseIds }, published: true }, select: { courseId: true } }),
    db.scormAttempt.findMany({
      where: { userId, package: { courseId: { in: courseIds }, published: true } },
      select: { completionStatus: true, successStatus: true, package: { select: { courseId: true } } },
    }),
  ]);
  const result = new Map<string, number>();
  for (const id of courseIds) {
    const t = totals.filter((l) => l.module.courseId === id).length + packages.filter((p) => p.courseId === id).length;
    const d =
      done.filter((c) => c.lesson.module.courseId === id).length + scormDone.filter((a) => a.package.courseId === id && isComplete(a)).length;
    result.set(id, t ? Math.round((d / t) * 100) : 0);
  }
  return result;
}
