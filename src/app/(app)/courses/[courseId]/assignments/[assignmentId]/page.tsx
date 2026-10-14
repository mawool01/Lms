import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireCourseMember } from "@/lib/permissions";
import { deleteAssignment, gradeSubmission, submitAssignment, updateAssignment } from "@/lib/actions/assessments";
import { AssignmentForm } from "@/components/assess/assignment-form";
import { ActionForm, LocalTime, SubmitButton } from "@/components/forms";
import { Markdown } from "@/components/markdown";
import { Avatar, Card, Pill } from "@/components/ui";

export default async function AssignmentPage({ params }: { params: Promise<{ courseId: string; assignmentId: string }> }) {
  const { courseId, assignmentId } = await params;
  const user = await requireUser();
  const { canManage, isEnrolled } = await requireCourseMember(user, courseId);
  const assignment = await db.assignment.findUnique({ where: { id: assignmentId } });
  if (!assignment || assignment.courseId !== courseId || (!assignment.published && !canManage)) notFound();

  const header = (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 className="text-2xl font-bold">{assignment.title}</h2>
        <div className="flex gap-2">
          <Pill tone="brand">{assignment.maxPoints} points</Pill>
          {assignment.dueAt && <Pill tone={assignment.dueAt < new Date() ? "red" : "gray"}>Due <LocalTime date={assignment.dueAt} /></Pill>}
        </div>
      </div>
      {assignment.description ? <div className="mt-3"><Markdown>{assignment.description}</Markdown></div> : <p className="muted mt-2">No instructions.</p>}
    </Card>
  );

  if (canManage) {
    const [students, submissions] = await Promise.all([
      db.enrollment.findMany({ where: { courseId }, include: { user: { select: { id: true, name: true, avatarUrl: true } } }, orderBy: { user: { name: "asc" } } }),
      db.submission.findMany({ where: { assignmentId } }),
    ]);
    const byUser = new Map(submissions.map((s) => [s.userId, s]));
    return (
      <div className="space-y-6">
        <Link href={`/courses/${courseId}/assignments`} className="link text-sm">← All assignments</Link>
        {header}
        <Card title={`Submissions (${submissions.length}/${students.length})`}>
          <div className="space-y-3">
            {students.length === 0 && <p className="muted text-sm">No students enrolled.</p>}
            {students.map(({ user: s }) => {
              const sub = byUser.get(s.id);
              return (
                <details key={s.id} className="rounded-xl border border-slate-200 dark:border-slate-800" open={!!sub}>
                  <summary className="flex cursor-pointer list-none items-center gap-3 p-3">
                    <Avatar name={s.name} url={s.avatarUrl} size={28} />
                    <span className="flex-1 font-medium">{s.name}</span>
                    {!sub ? <Pill>Not submitted</Pill> : sub.grade == null ? <Pill tone="yellow">Needs grading</Pill> : <Pill tone="green">{sub.grade}/{assignment.maxPoints}</Pill>}
                  </summary>
                  {sub && (
                    <div className="space-y-3 border-t border-slate-100 p-4 dark:border-slate-800">
                      <p className="muted text-xs">Submitted <LocalTime date={sub.submittedAt} />{assignment.dueAt && sub.submittedAt > assignment.dueAt && <span className="ml-1 font-semibold text-red-600">(late)</span>}</p>
                      {sub.content && <div className="rounded-lg bg-slate-50 p-3 text-sm whitespace-pre-wrap dark:bg-slate-800/50">{sub.content}</div>}
                      {sub.linkUrl && <a href={sub.linkUrl} target="_blank" rel="noopener noreferrer" className="link text-sm break-all">🔗 {sub.linkUrl}</a>}
                      <ActionForm action={gradeSubmission.bind(null, sub.id)} className="grid gap-2 sm:grid-cols-[120px_1fr_auto] sm:items-start">
                        <input name="grade" type="number" min={0} max={assignment.maxPoints} defaultValue={sub.grade ?? ""} placeholder={`/ ${assignment.maxPoints}`} aria-label="Grade" />
                        <textarea name="feedback" rows={2} defaultValue={sub.feedback ?? ""} placeholder="Feedback for the student" aria-label="Feedback" />
                        <SubmitButton className="btn-primary">Save grade</SubmitButton>
                      </ActionForm>
                    </div>
                  )}
                </details>
              );
            })}
          </div>
        </Card>
        <Card title="Edit assignment">
          <AssignmentForm action={updateAssignment.bind(null, assignmentId)} values={assignment} submitLabel="Save changes" />
          <form action={deleteAssignment.bind(null, assignmentId)} className="mt-4 border-t border-slate-100 pt-4 dark:border-slate-800">
            <button className="btn-ghost btn-sm text-red-600">Delete assignment</button>
          </form>
        </Card>
      </div>
    );
  }

  const submission = await db.submission.findUnique({ where: { assignmentId_userId: { assignmentId, userId: user.id } } });
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link href={`/courses/${courseId}/assignments`} className="link text-sm">← All assignments</Link>
      {header}
      {submission?.grade != null && (
        <Card title="Your grade">
          <p className="text-3xl font-bold">{submission.grade}<span className="muted text-lg">/{assignment.maxPoints}</span></p>
          {submission.feedback && <div className="mt-3 rounded-lg bg-brand-50 p-3 text-sm whitespace-pre-wrap dark:bg-brand-950/50"><span className="font-semibold">Feedback: </span>{submission.feedback}</div>}
        </Card>
      )}
      {isEnrolled && (
        <Card title={submission ? "Your submission" : "Submit your work"}>
          {submission && <p className="muted mb-3 text-xs">Last submitted <LocalTime date={submission.submittedAt} /></p>}
          {submission?.grade != null ? (
            <>
              {submission.content && <div className="rounded-lg bg-slate-50 p-3 text-sm whitespace-pre-wrap dark:bg-slate-800/50">{submission.content}</div>}
              {submission.linkUrl && <a href={submission.linkUrl} className="link mt-2 block text-sm break-all">🔗 {submission.linkUrl}</a>}
            </>
          ) : (
            <ActionForm action={submitAssignment.bind(null, assignmentId)} className="space-y-3">
              <textarea name="content" rows={8} defaultValue={submission?.content} placeholder="Type your response…" aria-label="Response" />
              <input name="linkUrl" type="url" defaultValue={submission?.linkUrl ?? ""} placeholder="Link to your work (Google Doc, video, etc.) — optional" aria-label="Link" />
              <SubmitButton pendingText="Submitting…">{submission ? "Update submission" : "Submit"}</SubmitButton>
            </ActionForm>
          )}
        </Card>
      )}
    </div>
  );
}
