import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getCourseAccess } from "@/lib/permissions";
import {
  createLesson,
  createModule,
  deleteAnnouncement,
  deleteModule,
  moveLesson,
  moveModule,
  postAnnouncement,
  renameModule,
  unenroll,
} from "@/lib/actions/courses";
import { ActionForm, LocalTime, SubmitButton } from "@/components/forms";
import { Markdown } from "@/components/markdown";
import { Avatar, Card, EmptyState, Pill, ProgressBar } from "@/components/ui";
import { timeAgo } from "@/lib/utils";

export default async function CourseOverview({ params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await params;
  const user = await requireUser();
  const { course, canManage, isEnrolled } = await getCourseAccess(user, courseId);
  const isMember = canManage || isEnrolled;

  const [modules, announcements, completions, upcomingQuizzes, upcomingAssignments] = await Promise.all([
    db.module.findMany({
      where: { courseId },
      orderBy: [{ position: "asc" }, { id: "asc" }],
      include: { lessons: { orderBy: [{ position: "asc" }, { id: "asc" }], select: { id: true, title: true, points: true } } },
    }),
    isMember
      ? db.announcement.findMany({ where: { courseId }, orderBy: { createdAt: "desc" }, take: 5, include: { author: { select: { name: true, avatarUrl: true } } } })
      : [],
    db.lessonCompletion.findMany({ where: { userId: user.id, lesson: { module: { courseId } } }, select: { lessonId: true } }),
    isMember ? db.quiz.findMany({ where: { courseId, published: true, dueAt: { gte: new Date() } }, orderBy: { dueAt: "asc" }, take: 3 }) : [],
    isMember ? db.assignment.findMany({ where: { courseId, published: true, dueAt: { gte: new Date() } }, orderBy: { dueAt: "asc" }, take: 3 }) : [],
  ]);
  const done = new Set(completions.map((c) => c.lessonId));
  const allLessons = modules.flatMap((m) => m.lessons);
  const progress = allLessons.length ? Math.round((done.size / allLessons.length) * 100) : 0;
  const nextLesson = allLessons.find((l) => !done.has(l.id));
  const upcoming = [
    ...upcomingQuizzes.map((q) => ({ id: q.id, title: q.title, dueAt: q.dueAt!, href: `/courses/${courseId}/quizzes/${q.id}`, kind: "Quiz" })),
    ...upcomingAssignments.map((a) => ({ id: a.id, title: a.title, dueAt: a.dueAt!, href: `/courses/${courseId}/assignments/${a.id}`, kind: "Assignment" })),
  ].sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime());

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        {course.description && (
          <Card title="About this course">
            <Markdown>{course.description}</Markdown>
          </Card>
        )}

        <Card
          title="Course content"
          action={<span className="muted text-sm">{allLessons.length} lessons</span>}
        >
          {modules.length === 0 && <EmptyState icon="🧱" title="No modules yet" />}
          <div className="space-y-4">
            {modules.map((mod, mi) => (
              <div key={mod.id} className="rounded-xl border border-slate-200 dark:border-slate-800">
                <div className="flex items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2.5 dark:border-slate-800 dark:bg-slate-800/40">
                  <h3 className="font-semibold">
                    <span className="muted mr-2 text-sm">Module {mi + 1}</span>
                    {mod.title}
                  </h3>
                  {canManage && (
                    <div className="flex shrink-0 items-center gap-1">
                      <form action={moveModule.bind(null, mod.id, -1)}><button className="btn-ghost btn-sm" disabled={mi === 0} title="Move up">↑</button></form>
                      <form action={moveModule.bind(null, mod.id, 1)}><button className="btn-ghost btn-sm" disabled={mi === modules.length - 1} title="Move down">↓</button></form>
                      <details className="relative">
                        <summary className="btn-ghost btn-sm cursor-pointer list-none">⋯</summary>
                        <div className="card absolute right-0 z-10 mt-1 w-64 space-y-2 p-3">
                          <form action={renameModule.bind(null, mod.id)} className="flex gap-2">
                            <input name="title" defaultValue={mod.title} aria-label="Module title" />
                            <button className="btn-secondary btn-sm">Rename</button>
                          </form>
                          <form action={deleteModule.bind(null, mod.id)}>
                            <button className="btn-danger btn-sm w-full">Delete module & lessons</button>
                          </form>
                        </div>
                      </details>
                    </div>
                  )}
                </div>
                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                  {mod.lessons.map((lesson, li) => {
                    const href = isMember ? `/courses/${courseId}/lessons/${lesson.id}` : undefined;
                    return (
                      <li key={lesson.id} className="flex items-center gap-3 px-4 py-2.5">
                        <span className={done.has(lesson.id) ? "text-emerald-500" : "text-slate-300 dark:text-slate-600"}>
                          {done.has(lesson.id) ? "✔" : "○"}
                        </span>
                        {href ? (
                          <Link href={href} className="flex-1 text-sm hover:underline">{lesson.title}</Link>
                        ) : (
                          <span className="flex-1 text-sm">{lesson.title}</span>
                        )}
                        <span className="muted hidden text-xs sm:inline">{lesson.points} pts</span>
                        {canManage && (
                          <span className="flex items-center gap-1">
                            <form action={moveLesson.bind(null, lesson.id, -1)}><button className="btn-ghost btn-sm" disabled={li === 0} title="Move up">↑</button></form>
                            <form action={moveLesson.bind(null, lesson.id, 1)}><button className="btn-ghost btn-sm" disabled={li === mod.lessons.length - 1} title="Move down">↓</button></form>
                            <Link href={`/courses/${courseId}/lessons/${lesson.id}/edit`} className="btn-ghost btn-sm">Edit</Link>
                          </span>
                        )}
                      </li>
                    );
                  })}
                  {mod.lessons.length === 0 && <li className="muted px-4 py-3 text-sm">No lessons in this module yet.</li>}
                </ul>
                {canManage && (
                  <ActionForm action={createLesson.bind(null, mod.id)} className="flex gap-2 border-t border-slate-100 p-3 dark:border-slate-800">
                    <input name="title" placeholder="New lesson title" aria-label="New lesson title" required />
                    <SubmitButton className="btn-secondary shrink-0">+ Lesson</SubmitButton>
                  </ActionForm>
                )}
              </div>
            ))}
          </div>
          {canManage && (
            <ActionForm action={createModule.bind(null, courseId)} resetOnSuccess className="mt-4 flex gap-2">
              <input name="title" placeholder="New module title" aria-label="New module title" required />
              <SubmitButton className="btn-primary shrink-0">+ Module</SubmitButton>
            </ActionForm>
          )}
        </Card>
      </div>

      <div className="space-y-6">
        {isEnrolled && (
          <Card title="Your progress">
            <div className="mb-2 flex items-baseline justify-between">
              <span className="text-3xl font-bold">{progress}%</span>
              <span className="muted text-sm">{done.size}/{allLessons.length} lessons</span>
            </div>
            <ProgressBar value={progress} tone={progress === 100 ? "green" : "brand"} />
            {nextLesson ? (
              <Link href={`/courses/${courseId}/lessons/${nextLesson.id}`} className="btn-primary mt-4 w-full">
                {done.size ? "Continue" : "Start"}: {nextLesson.title}
              </Link>
            ) : allLessons.length > 0 ? (
              <p className="mt-4 text-sm font-medium text-emerald-600">🎉 You&apos;ve completed every lesson!</p>
            ) : null}
          </Card>
        )}

        {isMember && course.meetingUrl && (
          <Card title="Live class">
            <p className="muted mb-3 text-sm">Join your instructor&apos;s live session.</p>
            <a href={course.meetingUrl} target="_blank" rel="noopener noreferrer" className="btn-primary w-full">🎥 Join live class</a>
          </Card>
        )}

        {isMember && (
          <Card title="Coming up">
            {upcoming.length === 0 ? (
              <p className="muted text-sm">Nothing due soon.</p>
            ) : (
              <ul className="space-y-3">
                {upcoming.map((u) => (
                  <li key={u.id}>
                    <Link href={u.href} className="text-sm font-medium hover:underline">{u.title}</Link>
                    <p className="muted text-xs">{u.kind} · due <LocalTime date={u.dueAt} /></p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}

        {isMember && (
          <Card title="Announcements">
            {canManage && (
              <ActionForm action={postAnnouncement.bind(null, courseId)} resetOnSuccess className="mb-4 space-y-2">
                <input name="title" placeholder="Title" aria-label="Announcement title" required />
                <textarea name="body" placeholder="Write an announcement…" rows={3} aria-label="Announcement" required />
                <SubmitButton className="btn-primary btn-sm">Post announcement</SubmitButton>
              </ActionForm>
            )}
            {announcements.length === 0 ? (
              <p className="muted text-sm">No announcements yet.</p>
            ) : (
              <ul className="space-y-4">
                {announcements.map((a) => (
                  <li key={a.id} className="border-l-2 border-brand-400 pl-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-medium">{a.title}</p>
                      {canManage && (
                        <form action={deleteAnnouncement.bind(null, a.id)}><button className="muted text-xs hover:text-red-600" title="Delete">✕</button></form>
                      )}
                    </div>
                    <div className="text-sm"><Markdown>{a.body}</Markdown></div>
                    <p className="muted mt-1 flex items-center gap-1.5 text-xs">
                      <Avatar name={a.author.name} url={a.author.avatarUrl} size={18} /> {a.author.name} · {timeAgo(a.createdAt)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}

        {isEnrolled && (
          <form action={unenroll.bind(null, courseId)}>
            <button className="muted text-xs hover:text-red-600">Leave this course</button>
          </form>
        )}
        {!isMember && <Pill tone="brand">Enroll to access lessons, quizzes and discussions.</Pill>}
      </div>
    </div>
  );
}
