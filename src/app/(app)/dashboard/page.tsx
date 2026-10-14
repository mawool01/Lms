import Link from "next/link";
import { requireUser, type CurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { progressByCourse } from "@/lib/grades";
import { levelFor, totalPoints } from "@/lib/gamification";
import { activitySeries } from "@/lib/analytics";
import { CertDashboardAlerts } from "@/components/cert/dashboard-alerts";
import { CourseCard } from "@/components/course/course-card";
import { ActivityChart } from "@/components/analytics/charts";
import { LocalTime } from "@/components/forms";
import { Card, EmptyState, Pill, ProgressBar, Stat } from "@/components/ui";
import { timeAgo } from "@/lib/utils";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const user = await requireUser();
  const firstName = user.name.split(" ")[0];
  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold sm:text-3xl">Welcome back, {firstName} 👋</h1>
        <p className="muted">Here&apos;s what&apos;s happening in your learning community.</p>
      </div>
      <CertDashboardAlerts user={user} />
      {user.role === "STUDENT" ? <StudentDashboard user={user} /> : <StaffDashboard user={user} />}
    </>
  );
}

async function StudentDashboard({ user }: { user: CurrentUser }) {
  const courses = await db.course.findMany({
    where: { enrollments: { some: { userId: user.id } } },
    include: { teacher: { select: { name: true } } },
    orderBy: { title: "asc" },
  });
  const courseIds = courses.map((c) => c.id);
  const now = new Date();
  const [progress, points, badges, quizzes, assignments, announcements, recentPoints] = await Promise.all([
    progressByCourse(user.id, courseIds),
    totalPoints(user.id),
    db.userBadge.findMany({ where: { userId: user.id }, include: { badge: true }, orderBy: { awardedAt: "desc" } }),
    db.quiz.findMany({
      where: { courseId: { in: courseIds }, published: true, dueAt: { gte: now }, attempts: { none: { userId: user.id } } },
      include: { course: { select: { code: true } } },
      orderBy: { dueAt: "asc" },
      take: 5,
    }),
    db.assignment.findMany({
      where: { courseId: { in: courseIds }, published: true, dueAt: { gte: now }, submissions: { none: { userId: user.id } } },
      include: { course: { select: { code: true } } },
      orderBy: { dueAt: "asc" },
      take: 5,
    }),
    db.announcement.findMany({ where: { courseId: { in: courseIds } }, include: { course: { select: { code: true } } }, orderBy: { createdAt: "desc" }, take: 4 }),
    db.pointEvent.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 5 }),
  ]);
  const level = levelFor(points);
  const todo = [
    ...quizzes.map((q) => ({ id: q.id, title: q.title, code: q.course.code, dueAt: q.dueAt!, href: `/courses/${q.courseId}/quizzes/${q.id}`, icon: "📝" })),
    ...assignments.map((a) => ({ id: a.id, title: a.title, code: a.course.code, dueAt: a.dueAt!, href: `/courses/${a.courseId}/assignments/${a.id}`, icon: "📄" })),
  ].sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime());
  const avgProgress = courseIds.length ? Math.round([...progress.values()].reduce((s, v) => s + v, 0) / courseIds.length) : 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Points" value={points.toLocaleString()} icon="⭐" />
        <Stat label="Level" value={`${level.level} · ${level.name}`} icon="🚀" />
        <Stat label="Badges" value={badges.length} icon="🏅" />
        <Stat label="Avg progress" value={`${avgProgress}%`} icon="📈" />
      </div>

      <Card>
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2 text-sm">
          <span className="font-semibold">Level {level.level}: {level.name}</span>
          <span className="muted">{level.next ? `${level.next.min - points} pts to ${level.next.name}` : "Max level reached!"}</span>
        </div>
        <ProgressBar value={level.progress} />
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="My courses" action={<Link href="/catalog" className="link text-sm">Browse more</Link>}>
            {courses.length === 0 ? (
              <EmptyState icon="📘" title="No courses yet">Find something to learn in the <Link href="/catalog" className="link">Learning Center</Link>.</EmptyState>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {courses.map((c) => <CourseCard key={c.id} course={c} progress={progress.get(c.id)} />)}
              </div>
            )}
          </Card>
        </div>
        <div className="space-y-6">
          <Card title="To do">
            {todo.length === 0 ? (
              <p className="muted text-sm">You&apos;re all caught up! 🎉</p>
            ) : (
              <ul className="space-y-3">
                {todo.map((t) => (
                  <li key={t.id} className="flex gap-2">
                    <span>{t.icon}</span>
                    <div className="min-w-0">
                      <Link href={t.href} className="text-sm font-medium hover:underline">{t.title}</Link>
                      <p className="muted text-xs">{t.code} · due <LocalTime date={t.dueAt} /></p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title="Badges" action={<Link href="/profile" className="link text-sm">All</Link>}>
            {badges.length === 0 ? (
              <p className="muted text-sm">Complete your first lesson to earn a badge!</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {badges.map((b) => <span key={b.id} title={`${b.badge.name}: ${b.badge.description}`} className="flex h-11 w-11 items-center justify-center rounded-full bg-accent-50 text-2xl ring-1 ring-accent-200 dark:bg-accent-950/40 dark:ring-accent-800">{b.badge.icon}</span>)}
              </div>
            )}
          </Card>
          <Card title="Recent points">
            {recentPoints.length === 0 ? (
              <p className="muted text-sm">No points yet.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {recentPoints.map((p) => (
                  <li key={p.id} className="flex justify-between gap-2">
                    <span className="truncate">{p.reason}</span>
                    <span className="shrink-0 font-semibold text-emerald-600">+{p.points}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          {announcements.length > 0 && (
            <Card title="Announcements">
              <ul className="space-y-3">
                {announcements.map((a) => (
                  <li key={a.id}>
                    <Link href={`/courses/${a.courseId}`} className="text-sm font-medium hover:underline">{a.title}</Link>
                    <p className="muted text-xs">{a.course.code} · {timeAgo(a.createdAt)}</p>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

async function StaffDashboard({ user }: { user: CurrentUser }) {
  const isAdmin = user.role === "ADMIN";
  const courseWhere = isAdmin ? {} : { teacherId: user.id };
  const courses = await db.course.findMany({
    where: courseWhere,
    include: { teacher: { select: { name: true } }, _count: { select: { enrollments: true } } },
    orderBy: { updatedAt: "desc" },
    take: 6,
  });
  const courseIds = (await db.course.findMany({ where: courseWhere, select: { id: true } })).map((c) => c.id);
  const [submissionsToGrade, essaysToGrade, studentCount, userCounts, activity, recentThreads] = await Promise.all([
    db.submission.findMany({
      where: { grade: null, assignment: { courseId: { in: courseIds } } },
      include: { user: { select: { name: true } }, assignment: { select: { id: true, title: true, courseId: true } } },
      orderBy: { submittedAt: "asc" },
      take: 8,
    }),
    db.quizAttempt.findMany({
      where: { needsGrading: true, quiz: { courseId: { in: courseIds } } },
      include: { user: { select: { name: true } }, quiz: { select: { id: true, title: true, courseId: true } } },
      orderBy: { submittedAt: "asc" },
      take: 8,
    }),
    db.enrollment.findMany({ where: { courseId: { in: courseIds } }, distinct: ["userId"], select: { userId: true } }),
    isAdmin ? db.user.groupBy({ by: ["role"], _count: true }) : Promise.resolve([]),
    activitySeries(isAdmin ? {} : { courseIds }, 14),
    db.forumThread.findMany({ where: { courseId: { in: courseIds } }, include: { course: { select: { code: true } }, _count: { select: { posts: true } } }, orderBy: { updatedAt: "desc" }, take: 5 }),
  ]);
  const toGrade = [
    ...submissionsToGrade.map((s) => ({ id: s.id, title: s.assignment.title, href: `/courses/${s.assignment.courseId}/assignments/${s.assignment.id}`, name: s.user.name, at: s.submittedAt })),
    ...essaysToGrade.map((a) => ({ id: a.id, title: `${a.quiz.title} (essay)`, href: `/courses/${a.quiz.courseId}/quizzes/${a.quiz.id}/attempts/${a.id}`, name: a.user.name, at: a.submittedAt })),
  ].sort((a, b) => a.at.getTime() - b.at.getTime());
  const roleCount = (r: string) => userCounts.find((u) => u.role === r)?._count ?? 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label={isAdmin ? "Courses" : "My courses"} value={courseIds.length} icon="📘" />
        <Stat label="Students" value={isAdmin ? roleCount("STUDENT") : studentCount.length} icon="🎓" />
        {isAdmin ? <Stat label="Teachers" value={roleCount("TEACHER")} icon="🧑‍🏫" /> : <Stat label="To grade" value={toGrade.length} icon="✍️" />}
        <Stat label="Activity (14d)" value={activity.reduce((s, d) => s + d.Lessons + d.Quizzes + d.Assignments + d.Forum, 0)} icon="⚡" />
      </div>

      <Card title={isAdmin ? "Platform activity — last 14 days" : "Student activity — last 14 days"}>
        <ActivityChart data={activity} />
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card title={isAdmin ? "Recently updated courses" : "My courses"} action={<Link href="/courses/new" className="btn-primary btn-sm">+ New course</Link>}>
            {courses.length === 0 ? (
              <EmptyState icon="🧑‍🏫" title="No courses yet">Create your first course to get started.</EmptyState>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {courses.map((c) => (
                  <CourseCard
                    key={c.id}
                    course={c}
                    footer={
                      <div className="flex items-center justify-between">
                        <span className="muted text-xs">{c._count.enrollments} students</span>
                        <Link href={`/courses/${c.id}/analytics`} className="link text-xs">Analytics →</Link>
                      </div>
                    }
                  />
                ))}
              </div>
            )}
          </Card>
        </div>
        <div className="space-y-6">
          <Card title="Needs grading">
            {toGrade.length === 0 ? (
              <p className="muted text-sm">Nothing waiting. 🎉</p>
            ) : (
              <ul className="space-y-3">
                {toGrade.map((s) => (
                  <li key={s.id}>
                    <Link href={s.href} className="text-sm font-medium hover:underline">{s.title}</Link>
                    <p className="muted text-xs">{s.name} · {timeAgo(s.at)}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title="Recent discussions">
            {recentThreads.length === 0 ? (
              <p className="muted text-sm">No discussions yet.</p>
            ) : (
              <ul className="space-y-3">
                {recentThreads.map((t) => (
                  <li key={t.id}>
                    <Link href={`/courses/${t.courseId}/forum/${t.id}`} className="text-sm font-medium hover:underline">{t.title}</Link>
                    <p className="muted text-xs"><Pill>{t.course.code}</Pill> {t._count.posts} replies · {timeAgo(t.updatedAt)}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
