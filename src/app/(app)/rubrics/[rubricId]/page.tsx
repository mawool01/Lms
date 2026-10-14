import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { canEditRubric } from "@/lib/rubric-access";
import { deleteRubric, duplicateRubric, setRubricShared } from "@/lib/actions/rubrics";
import { toRubricData } from "@/lib/rubrics";
import { RubricView } from "@/components/rubrics/rubric-view";
import { Card, Pill } from "@/components/ui";

export default async function RubricPage({ params }: { params: Promise<{ rubricId: string }> }) {
  const { rubricId } = await params;
  const user = await requireRole("ADMIN", "TEACHER");
  const r = await db.rubric.findUnique({
    where: { id: rubricId },
    include: {
      owner: { select: { name: true } },
      assignments: { select: { id: true, title: true, courseId: true, course: { select: { title: true } } } },
      questions: { select: { id: true, quiz: { select: { id: true, title: true, courseId: true, course: { select: { title: true } } } } } },
    },
  });
  if (!r) notFound();
  const editable = canEditRubric(user, r);
  if (!editable && !r.shared) notFound();
  const rubric = toRubricData(r);
  const quizzes = [...new Map(r.questions.map((q) => [q.quiz.id, q.quiz])).values()];

  return (
    <div className="space-y-6">
      <Link href="/rubrics" className="link text-sm">← All rubrics</Link>
      <Card>
        <div className="flex flex-wrap items-center gap-2">
          <p className="muted flex-1 text-sm">By {r.owner.name} {r.shared && <Pill tone="brand">Shared site-wide</Pill>}</p>
          {editable && <Link href={`/rubrics/${r.id}/edit`} className="btn-primary btn-sm">Edit</Link>}
          <form action={duplicateRubric.bind(null, r.id)}><button className="btn-secondary btn-sm">Duplicate</button></form>
          {user.role === "ADMIN" && (
            <form action={setRubricShared.bind(null, r.id, !r.shared)}>
              <button className="btn-secondary btn-sm">{r.shared ? "Stop sharing" : "Share site-wide"}</button>
            </form>
          )}
        </div>
        <div className="mt-4">
          <RubricView rubric={rubric} />
        </div>
      </Card>
      {editable && (
        <Card title="Where it's used">
          {r.assignments.length + quizzes.length === 0 ? (
            <p className="muted text-sm">Not attached yet. Pick it under “Grading rubric” when editing an assignment or an essay question.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {r.assignments.map((a) => (
                <li key={a.id}>📝 <Link className="link" href={`/courses/${a.courseId}/assignments/${a.id}`}>{a.title}</Link> <span className="muted">· {a.course.title}</span></li>
              ))}
              {quizzes.map((q) => (
                <li key={q.id}>❓ <Link className="link" href={`/courses/${q.courseId}/quizzes/${q.id}/edit`}>{q.title}</Link> <span className="muted">· {q.course.title}</span></li>
              ))}
            </ul>
          )}
          <p className="muted mt-3 text-xs">Editing the rubric changes it everywhere it&apos;s attached. Grades already given keep the version they were scored with.</p>
          <form action={deleteRubric.bind(null, r.id)} className="mt-4 border-t border-slate-100 pt-4 dark:border-slate-800">
            <button className="btn-ghost btn-sm text-red-600">Delete rubric</button>
          </form>
        </Card>
      )}
    </div>
  );
}
