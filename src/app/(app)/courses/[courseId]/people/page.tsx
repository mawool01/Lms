import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireCourseMember } from "@/lib/permissions";
import { addStudents, removeStudent } from "@/lib/actions/courses";
import { startConversation } from "@/lib/actions/community";
import { ActionForm, SubmitButton } from "@/components/forms";
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
          {enrollments.map(({ user: s, enrolledAt }) => (
            <li key={s.id} className="flex items-center gap-3 py-3">
              <Avatar name={s.name} url={s.avatarUrl} />
              <div className="min-w-0 flex-1">
                <Link href={`/users/${s.id}`} className="font-medium hover:underline">{s.name}</Link>
                {canManage && <p className="muted truncate text-xs">{s.email} · joined {enrolledAt.toLocaleDateString("en-US")}</p>}
              </div>
              {s.id !== user.id && (
                <form action={startConversation.bind(null, s.id)}><button className="btn-ghost btn-sm">💬<span className="hidden sm:inline"> Message</span></button></form>
              )}
              {canManage && (
                <form action={removeStudent.bind(null, courseId, s.id)}><button className="btn-ghost btn-sm text-red-600" title="Remove from course">✕</button></form>
              )}
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
        </Card>
      )}
    </div>
  );
}
