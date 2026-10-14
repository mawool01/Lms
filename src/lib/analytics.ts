import "server-only";
import { db } from "./db";
import { courseReports } from "./grades";

const DAY = 24 * 3600 * 1000;

function dayKey(d: Date) {
  return d.toISOString().slice(0, 10);
}

/** Daily activity counts for the last `days` days. */
export async function activitySeries(where: { courseIds?: string[] }, days = 30) {
  const since = new Date(Date.now() - (days - 1) * DAY);
  since.setUTCHours(0, 0, 0, 0);
  const courseFilter = where.courseIds ? { in: where.courseIds } : undefined;
  const [completions, attempts, submissions, posts] = await Promise.all([
    db.lessonCompletion.findMany({ where: { completedAt: { gte: since }, ...(courseFilter ? { lesson: { module: { courseId: courseFilter } } } : {}) }, select: { completedAt: true } }),
    db.quizAttempt.findMany({ where: { submittedAt: { gte: since }, ...(courseFilter ? { quiz: { courseId: courseFilter } } : {}) }, select: { submittedAt: true } }),
    db.submission.findMany({ where: { submittedAt: { gte: since }, ...(courseFilter ? { assignment: { courseId: courseFilter } } : {}) }, select: { submittedAt: true } }),
    db.forumPost.findMany({ where: { createdAt: { gte: since }, ...(courseFilter ? { thread: { courseId: courseFilter } } : {}) }, select: { createdAt: true } }),
  ]);
  const series = Array.from({ length: days }, (_, i) => {
    const d = new Date(since.getTime() + i * DAY);
    return { key: dayKey(d), day: d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }), Lessons: 0, Quizzes: 0, Assignments: 0, Forum: 0 };
  });
  const index = new Map(series.map((s, i) => [s.key, i]));
  const bump = (d: Date, k: "Lessons" | "Quizzes" | "Assignments" | "Forum") => {
    const i = index.get(dayKey(d));
    if (i !== undefined) series[i][k]++;
  };
  completions.forEach((c) => bump(c.completedAt, "Lessons"));
  attempts.forEach((a) => bump(a.submittedAt, "Quizzes"));
  submissions.forEach((s) => bump(s.submittedAt, "Assignments"));
  posts.forEach((p) => bump(p.createdAt, "Forum"));
  return series.map((s) => ({ day: s.day, Lessons: s.Lessons, Quizzes: s.Quizzes, Assignments: s.Assignments, Forum: s.Forum }));
}

export type StudentInsight = {
  id: string;
  name: string;
  avatarUrl: string | null;
  progress: number;
  grade: number | null;
  lastActive: Date | null;
  missing: number;
  flags: string[];
};

export async function courseAnalytics(courseId: string) {
  const [enrollments, lessons, quizzes] = await Promise.all([
    db.enrollment.findMany({ where: { courseId }, include: { user: { select: { id: true, name: true, avatarUrl: true } } } }),
    db.lesson.findMany({
      where: { module: { courseId } },
      orderBy: [{ module: { position: "asc" } }, { position: "asc" }],
      select: { id: true, title: true, _count: { select: { completions: true } } },
    }),
    db.quiz.findMany({ where: { courseId, published: true }, orderBy: { createdAt: "asc" }, include: { attempts: { select: { userId: true, percent: true } } } }),
  ]);
  const userIds = enrollments.map((e) => e.userId);
  const reports = await courseReports(courseId, userIds);
  const n = userIds.length;
  const now = Date.now();

  const students: StudentInsight[] = enrollments.map(({ user }) => {
    const r = reports.get(user.id)!;
    const missing = r.items.filter((i) => i.status === "not-started" && i.dueAt && i.dueAt.getTime() < now).length;
    const flags: string[] = [];
    if (r.grade !== null && r.grade < 60) flags.push("Low grade");
    if (!r.lastActive || now - r.lastActive.getTime() > 14 * DAY) flags.push("Inactive 14+ days");
    if (missing > 0) flags.push(`${missing} missing`);
    return { id: user.id, name: user.name, avatarUrl: user.avatarUrl, progress: r.progress, grade: r.grade, lastActive: r.lastActive, missing, flags };
  });
  const avgProgress = n ? Math.round(students.reduce((s, x) => s + x.progress, 0) / n) : 0;
  students.forEach((s) => {
    if (n > 2 && s.progress < avgProgress - 25) s.flags.push("Falling behind");
  });
  students.sort((a, b) => b.flags.length - a.flags.length || (a.grade ?? 101) - (b.grade ?? 101));

  const graded = students.filter((s) => s.grade !== null);
  const avgGrade = graded.length ? Math.round((graded.reduce((s, x) => s + x.grade!, 0) / graded.length) * 10) / 10 : null;
  const activeWeek = students.filter((s) => s.lastActive && now - s.lastActive.getTime() < 7 * DAY).length;

  const buckets = [
    { name: "A (90+)", min: 90 },
    { name: "B (80s)", min: 80 },
    { name: "C (70s)", min: 70 },
    { name: "D (60s)", min: 60 },
    { name: "F (<60)", min: -1 },
  ];
  const distribution = [
    ...buckets.map((b, i) => ({
      name: b.name,
      count: graded.filter((s) => s.grade! >= b.min && (i === 0 || s.grade! < buckets[i - 1].min)).length,
    })),
    { name: "No grade", count: n - graded.length },
  ];

  const enrolledSet = new Set(userIds);
  const lessonCompletion = lessons.map((l) => ({ name: l.title, value: n ? Math.round((Math.min(l._count.completions, n) / n) * 100) : 0 }));
  const quizPerformance = quizzes.map((q) => {
    // Best attempt per enrolled student
    const best = new Map<string, number>();
    q.attempts.filter((a) => enrolledSet.has(a.userId)).forEach((a) => best.set(a.userId, Math.max(best.get(a.userId) ?? 0, a.percent)));
    const vals = [...best.values()];
    return { name: q.title, value: vals.length ? Math.round(vals.reduce((s, v) => s + v, 0) / vals.length) : 0, passMark: q.passingScore, attempted: vals.length };
  });

  return {
    kpis: { students: n, avgProgress, avgGrade, activeWeek, atRisk: students.filter((s) => s.flags.length > 0).length },
    students,
    distribution,
    lessonCompletion,
    quizPerformance,
    activity: await activitySeries({ courseIds: [courseId] }),
  };
}
