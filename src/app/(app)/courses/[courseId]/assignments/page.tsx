import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireCourseMember } from "@/lib/permissions";
import { rubricOptions } from "@/lib/rubric-access";
import { createAssignment } from "@/lib/actions/assessments";
import { AssignmentForm } from "@/components/assess/assignment-form";
import { LocalTime } from "@/components/forms";
import { Card, EmptyState, Pill } from "@/components/ui";

export default async function AssignmentsPage({ params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await params;
  const user = await requireUser();
  const { canManage } = await requireCourseMember(user, courseId);
  const assignments = await db.assignment.findMany({
    where: { courseId, ...(canManage ? {} : { published: true }) },
    orderBy: [{ dueAt: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
    include: { submissions: { where: canManage ? {} : { userId: user.id }, select: { grade: true } } },
  });
  const rubrics = canManage ? await rubricOptions(user) : [];

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-3 lg:col-span-2">
        {assignments.length === 0 && <EmptyState icon="📄" title="No assignments yet" />}
        {assignments.map((a) => {
          const mine = a.submissions[0];
          const ungraded = a.submissions.filter((s) => s.grade == null).length;
          const overdue = a.dueAt && a.dueAt < new Date();
          return (
            <Link key={a.id} href={`/courses/${courseId}/assignments/${a.id}`} className="card flex items-center gap-4 p-4 transition hover:shadow-md">
              <span className="text-2xl">📄</span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold">{a.title}</p>
                  {!a.published && <Pill tone="yellow">Draft</Pill>}
                </div>
                <p className="muted text-xs">
                  {a.maxPoints} points{a.dueAt && <> · due <LocalTime date={a.dueAt} /></>}
                </p>
              </div>
              {canManage ? (
                <div className="text-right text-sm">
                  <p className="font-semibold">{a.submissions.length} submitted</p>
                  {ungraded > 0 && <Pill tone="yellow">{ungraded} to grade</Pill>}
                </div>
              ) : mine ? (
                mine.grade != null ? <Pill tone="green">{mine.grade}/{a.maxPoints}</Pill> : <Pill tone="brand">Submitted</Pill>
              ) : (
                <Pill tone={overdue ? "red" : "gray"}>{overdue ? "Overdue" : "To do"}</Pill>
              )}
            </Link>
          );
        })}
      </div>
      {canManage && (
        <Card title="New assignment">
          <AssignmentForm action={createAssignment.bind(null, courseId)} submitLabel="Create assignment" rubrics={rubrics} />
        </Card>
      )}
    </div>
  );
}
