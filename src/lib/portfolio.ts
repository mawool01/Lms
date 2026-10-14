import "server-only";
import { db } from "./db";
import { progressByCourse } from "./grades";
import { levelFor, totalPoints } from "./gamification";
import { appUrl } from "./certifications/email";
import { ITEM_TYPE_ORDER, SLUG_RE } from "./portfolio-meta";

const RESERVED = new Set(["admin", "api", "new", "edit", "settings", "login", "signup", "portfolio", "transcript", "iclca", "www"]);

export function slugProblem(slug: string): string | null {
  if (!SLUG_RE.test(slug)) return "Use 3–40 lowercase letters, numbers and hyphens (not starting or ending with a hyphen).";
  if (RESERVED.has(slug)) return "That address is reserved. Please choose another.";
  return null;
}

/** Returns the user's portfolio slug, creating one from their name the first time. */
export async function ensurePortfolioSlug(user: { id: string; name: string; portfolioSlug: string | null }) {
  if (user.portfolioSlug) return user.portfolioSlug;
  const base =
    user.name
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/^(dr|mr|mrs|ms|prof)\.?\s+/, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 32) || "member";
  for (let i = 0; i < 50; i++) {
    const candidate = i === 0 && base.length >= 3 && !RESERVED.has(base) ? base : `${base}-${Math.random().toString(36).slice(2, 6)}`;
    if (slugProblem(candidate)) continue;
    try {
      await db.user.update({ where: { id: user.id }, data: { portfolioSlug: candidate } });
      return candidate;
    } catch {
      // taken — try another
    }
  }
  throw new Error("Couldn't create a portfolio address");
}

export const portfolioUrl = (slug: string) => appUrl(`/p/${slug}`);

/** Courses the user has finished (every lesson and published SCORM package), with the finish date. */
export async function completedCourses(userId: string) {
  const enrollments = await db.enrollment.findMany({ where: { userId }, include: { course: { select: { id: true, title: true, code: true, category: true } } } });
  const ids = enrollments.map((e) => e.courseId);
  if (!ids.length) return [];
  const progress = await progressByCourse(userId, ids);
  const done = enrollments.filter((e) => progress.get(e.courseId) === 100);
  const result = [];
  for (const e of done) {
    const [lastLesson, lastScorm] = await Promise.all([
      db.lessonCompletion.findFirst({ where: { userId, lesson: { module: { courseId: e.courseId } } }, orderBy: { completedAt: "desc" }, select: { completedAt: true } }),
      db.scormAttempt.findFirst({ where: { userId, package: { courseId: e.courseId }, completedAt: { not: null } }, orderBy: { completedAt: "desc" }, select: { completedAt: true } }),
    ]);
    const dates = [lastLesson?.completedAt, lastScorm?.completedAt].filter((d): d is Date => !!d);
    if (!dates.length) continue; // a course with no content isn't "completed"
    result.push({ ...e.course, completedAt: new Date(Math.max(...dates.map((d) => d.getTime()))) });
  }
  return result.sort((a, b) => b.completedAt.getTime() - a.completedAt.getTime());
}

/**
 * Loads a portfolio by its address for a given viewer, applying the owner's visibility setting.
 * Returns null when the viewer isn't allowed to see it (callers should 404).
 */
export async function loadPortfolio(slug: string, viewer: { id: string; role: string } | null) {
  const user = await db.user.findUnique({
    where: { portfolioSlug: slug.toLowerCase() },
    select: {
      id: true, name: true, avatarUrl: true, bio: true, institution: true, jobTitle: true, active: true,
      waMembershipLevel: true, waMembershipStatus: true, waIsMember: true,
      portfolioSlug: true, portfolioVisibility: true, portfolioHeadline: true, portfolioSummary: true,
      portfolioShowCertifications: true, portfolioShowCourses: true, portfolioShowBadges: true, portfolioShowPoints: true,
    },
  });
  if (!user?.active) return null;
  const isOwner = viewer?.id === user.id;
  const isAdmin = viewer?.role === "ADMIN";
  if (user.portfolioVisibility === "PRIVATE" && !isOwner && !isAdmin) return null;

  const [items, certifications, courses, badges, points] = await Promise.all([
    db.portfolioItem.findMany({ where: { userId: user.id, visible: true }, orderBy: [{ position: "asc" }, { startDate: "desc" }] }),
    user.portfolioShowCertifications
      ? db.certification.findMany({
          where: { holderId: user.id, revokedAt: null },
          include: { program: { select: { name: true, kind: true } }, level: { select: { name: true } } },
          orderBy: { issuedAt: "desc" },
        })
      : Promise.resolve([]),
    user.portfolioShowCourses ? completedCourses(user.id) : Promise.resolve([]),
    user.portfolioShowBadges ? db.userBadge.findMany({ where: { userId: user.id }, include: { badge: true }, orderBy: { awardedAt: "asc" } }) : Promise.resolve([]),
    user.portfolioShowPoints ? totalPoints(user.id) : Promise.resolve(0),
  ]);
  const byType = Object.fromEntries(ITEM_TYPE_ORDER.map((t) => [t, items.filter((i) => i.type === t)])) as Record<(typeof ITEM_TYPE_ORDER)[number], typeof items>;
  return { user, isOwner, isAdmin, items, byType, certifications, courses, badges, points, level: levelFor(points) };
}

export type Portfolio = NonNullable<Awaited<ReturnType<typeof loadPortfolio>>>;
