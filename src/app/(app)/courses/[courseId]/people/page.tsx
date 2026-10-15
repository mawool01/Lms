import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireCourseMember } from "@/lib/permissions";
import { addStudents, removeStudent } from "@/lib/actions/courses";
import { startConversation } from "@/lib/actions/community";
import { ActionForm, ConfirmForm, SubmitButton } from "@/components/forms";
import { Avatar, Card, Pill } from "@/components/ui";

export default async function PeoplePage({ params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await params;
  const user = await requireUser();
  const { course, canManage } = await requireCourseMember(user, courseId);
  const enrollments = await db.enrollment.findMany({
    where: { courseId },
    include: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } },
    orderBy: { user: { name: "asc" } },
  });
  const waLinked = await db.courseWaLink.count({ where: { courseId, active: true } });

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card title={`Class roster (${enrollments.length})`} className="lg:col-span-2">
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          <li className="flex items-center gap-3 py-3">
            <Avatar name={course.teacher.name} url={course.teacher.avatarUrl} />
            <Link href={`/users/${course.teacher.id}`} className="flex-1 font-medium hover:underline">{course.teacher.name}</Link>
            <Pill tone="brand">Instructor</Pill>
            {course.teacher.id !== user.id && (
              <form action={startConversation.bind(null, course.teacher.id)}><button className="btn-ghost btn-sm">💬 Message</button></form>
            )}
          </li>
          {enrollments.map(({ user: s, enrolledAt, source }) => (
            <li key={s.id} className="flex items-center gap-3 py-3">
              <Avatar name={s.name} url={s.avatarUrl} />
              <div className="min-w-0 flex-1">
                <Link href={`/users/${s.id}`} className="font-medium hover:underline">{s.name}</Link>
                {canManage && (
                  <p className="muted truncate text-xs">
                    {s.email} · joined {enrolledAt.toLocaleDateString("en-US")}
                    {source === "WILD_APRICOT" && " · via Wild Apricot"}
                  </p>
                )}
              </div>
              {canManage && source === "WILD_APRICOT" && <Pill tone="green">🌿</Pill>}
              {s.id !== user.id && (
                <form action={startConversation.bind(null, s.id)}><button className="btn-ghost btn-sm">💬<span className="hidden sm:inline"> Message</span></button></form>
              )}
              {canManage &&
                (source === "WILD_APRICOT" ? (
                  <ConfirmForm
                    action={removeStudent.bind(null, courseId, s.id)}
                    confirm={`${s.name} is enrolled through Wild Apricot. Removing them here is temporary — the next sync will add them back unless you unlink it in course settings, or they stop being covered in Wild Apricot. Remove anyway?`}
                  >
                    <button className="btn-ghost btn-sm text-red-600" title="Remove from course">✕</button>
                  </ConfirmForm>
                ) : (
                  <form action={removeStudent.bind(null, courseId, s.id)}>
                    <button className="btn-ghost btn-sm text-red-600" title="Remove from course">✕</button>
                  </form>
                ))}
            </li>
          ))}
        </ul>
      </Card>
      {canManage && (
        <Card title="Enroll students">
          <ActionForm action={addStudents.bind(null, courseId)} resetOnSuccess className="space-y-3">
            <textarea name="emails" rows={5} placeholder={"student1@iclca.org\nstudent2@iclca.org"} aria-label="Student emails" />
            <p className="muted text-xs">Enter email addresses separated by commas or new lines. Students need an account first.</p>
            <SubmitButton>Enroll</SubmitButton>
          </ActionForm>
          {waLinked > 0 && (
            <p className="muted mt-4 border-t border-slate-100 pt-3 text-xs dark:border-slate-800">
              🌿 {waLinked === 1 ? "One Wild Apricot link feeds" : `${waLinked} Wild Apricot links feed`} this course, so the people
              they cover are enrolled automatically. People you add here are kept separate and never removed by that sync —{" "}
              <Link href={`/courses/${courseId}/settings`} className="underline">manage the links</Link>.
            </p>
          )}
        </Card>
      )}
    </div>
  );
}
