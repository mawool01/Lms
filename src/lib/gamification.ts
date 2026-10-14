import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "./db";

export const POINTS = {
  quizPass: 50,
  quizPerfect: 25,
  assignmentSubmit: 20,
  assignmentExcellent: 30,
  forumThread: 5,
  forumReply: 2,
  courseComplete: 100,
} as const;

/** Badge catalogue. Seeded/upserted on demand so new badges appear automatically. */
export const BADGES = [
  { key: "first-steps", name: "First Steps", description: "Completed your first lesson", icon: "👣" },
  { key: "bookworm", name: "Bookworm", description: "Completed 25 lessons", icon: "📚" },
  { key: "quiz-whiz", name: "Quiz Whiz", description: "Scored 100% on a quiz", icon: "🧠" },
  { key: "course-finisher", name: "Course Finisher", description: "Completed every lesson in a course", icon: "🎓" },
  { key: "early-bird", name: "Early Bird", description: "Submitted an assignment at least a day early", icon: "🐦" },
  { key: "conversationalist", name: "Conversationalist", description: "Made 10 forum posts", icon: "💬" },
  { key: "rising-star", name: "Rising Star", description: "Earned 250 points", icon: "⭐" },
  { key: "high-achiever", name: "High Achiever", description: "Earned 1,000 points", icon: "🏆" },
] as const;

export type BadgeKey = (typeof BADGES)[number]["key"];

export const LEVELS = [
  { min: 0, name: "Newcomer" },
  { min: 100, name: "Learner" },
  { min: 250, name: "Explorer" },
  { min: 500, name: "Achiever" },
  { min: 1000, name: "Scholar" },
  { min: 2000, name: "Master" },
];

export function levelFor(points: number) {
  let index = 0;
  LEVELS.forEach((l, i) => {
    if (points >= l.min) index = i;
  });
  const next = LEVELS[index + 1];
  const current = LEVELS[index];
  const progress = next ? Math.round(((points - current.min) / (next.min - current.min)) * 100) : 100;
  return { level: index + 1, name: current.name, next, progress };
}

/** Awards points once per sourceKey. Returns true if newly awarded. */
export async function awardPoints(userId: string, points: number, reason: string, sourceKey: string, courseId?: string) {
  try {
    await db.pointEvent.create({ data: { userId, points, reason, sourceKey, courseId } });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return false;
    throw e;
  }
  await checkPointBadges(userId);
  return true;
}

export async function awardBadge(userId: string, key: BadgeKey) {
  const def = BADGES.find((b) => b.key === key)!;
  const badge = await db.badge.upsert({
    where: { key },
    update: {},
    create: { key, name: def.name, description: def.description, icon: def.icon },
  });
  await db.userBadge.upsert({
    where: { userId_badgeId: { userId, badgeId: badge.id } },
    update: {},
    create: { userId, badgeId: badge.id },
  });
}

export async function totalPoints(userId: string, courseId?: string) {
  const r = await db.pointEvent.aggregate({ where: { userId, ...(courseId ? { courseId } : {}) }, _sum: { points: true } });
  return r._sum.points ?? 0;
}

async function checkPointBadges(userId: string) {
  const total = await totalPoints(userId);
  if (total >= 250) await awardBadge(userId, "rising-star");
  if (total >= 1000) await awardBadge(userId, "high-achiever");
}

/** Called after a lesson is completed. */
export async function onLessonCompleted(userId: string, lessonId: string) {
  const lesson = await db.lesson.findUniqueOrThrow({ where: { id: lessonId }, include: { module: true } });
  const courseId = lesson.module.courseId;
  await awardPoints(userId, lesson.points, `Completed lesson “${lesson.title}”`, `lesson:${lessonId}`, courseId);

  const completedCount = await db.lessonCompletion.count({ where: { userId } });
  if (completedCount >= 1) await awardBadge(userId, "first-steps");
  if (completedCount >= 25) await awardBadge(userId, "bookworm");

  await checkCourseCompletion(userId, courseId);
}

/** Awards the course-finisher badge once every lesson and published SCORM package is complete. */
export async function checkCourseCompletion(userId: string, courseId: string) {
  const [lessons, lessonsDone, packages, packagesDone] = await Promise.all([
    db.lesson.count({ where: { module: { courseId } } }),
    db.lessonCompletion.count({ where: { userId, lesson: { module: { courseId } } } }),
    db.scormPackage.count({ where: { courseId, published: true } }),
    db.scormAttempt.count({
      where: {
        userId,
        package: { courseId, published: true },
        OR: [{ completionStatus: "completed" }, { successStatus: { in: ["passed", "failed"] } }],
      },
    }),
  ]);
  const total = lessons + packages;
  if (total > 0 && lessonsDone + packagesDone >= total) {
    await awardBadge(userId, "course-finisher");
    await awardPoints(userId, POINTS.courseComplete, "Completed all content in a course", `course-complete:${courseId}`, courseId);
  }
}

export async function onForumPost(userId: string, postKey: string, isThread: boolean, courseId: string) {
  await awardPoints(
    userId,
    isThread ? POINTS.forumThread : POINTS.forumReply,
    isThread ? "Started a forum discussion" : "Replied in a forum",
    postKey,
    courseId,
  );
  const posts = (await db.forumPost.count({ where: { authorId: userId } })) + (await db.forumThread.count({ where: { authorId: userId } }));
  if (posts >= 10) await awardBadge(userId, "conversationalist");
}

export type LeaderboardRow = { userId: string; name: string; avatarUrl: string | null; points: number; badges: number };

export async function leaderboard(opts: { courseId?: string; limit?: number } = {}): Promise<LeaderboardRow[]> {
  const grouped = await db.pointEvent.groupBy({
    by: ["userId"],
    where: {
      ...(opts.courseId ? { courseId: opts.courseId } : {}),
      user: { showOnLeaderboard: true, active: true, role: "STUDENT" },
    },
    _sum: { points: true },
    orderBy: { _sum: { points: "desc" } },
    take: opts.limit ?? 50,
  });
  const users = await db.user.findMany({
    where: { id: { in: grouped.map((g) => g.userId) } },
    select: { id: true, name: true, avatarUrl: true, _count: { select: { badges: true } } },
  });
  const byId = new Map(users.map((u) => [u.id, u]));
  return grouped.map((g) => {
    const u = byId.get(g.userId)!;
    return { userId: g.userId, name: u.name, avatarUrl: u.avatarUrl, points: g._sum.points ?? 0, badges: u._count.badges };
  });
}
