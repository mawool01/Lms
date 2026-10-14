import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireCourseMember } from "@/lib/permissions";
import { courseReports, studentCourseReport } from "@/lib/grades";
import { letterGrade } from "@/lib/utils";
import { LocalTime } from "@/components/forms";
import { Avatar, Card, EmptyState, Pill, ProgressBar, Stat } from "@/components/ui";

const ITEM_PATHS = { quiz: "quizzes", assignment: "assignments", scorm: "scorm" } as const;
const ITEM_ICONS = { quiz: "📝", assignment: "📄", scorm: "📦" } as const;

function gradeTone(p: number | null) {
  if (p === null) return "gray" as const;
  if (p >= 80) return "green" as const;
  if (p >= 60) return "yellow" as const;
  return "red" as const;
}

export default async function GradesPage({ params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await params;
  const user = await requireUser();
  const { canManage } = await requireCourseMember(user, courseId);

  if (!canManage) {
    const r = await studentCourseReport(courseId, user.id);
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Current grade" value={r.grade !== null ? `${r.grade}%` : "—"} icon="🎯" />
          <Stat label="Letter" value={letterGrade(r.grade)} icon="🅰️" />
          <Stat label="Content done" value={`${r.lessonsDone}/${r.lessonsTotal}`} icon="📘" />
          <Stat label="Progress" value={`${r.progress}%`} icon="📈" />
        </div>
        <Card title="Grade breakdown" action={<span className="muted text-xs">Weighted by item; only graded work counts</span>}>
          {r.items.length === 0 ? (
            <EmptyState icon="🗒️" title="No graded work yet" />
          ) : (
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead><tr><th>Item</th><th>Type</th><th>Due</th><th>Weight</th><th>Score</th></tr></thead>
                <tbody>
                  {r.items.map((i) => (
                    <tr key={i.id}>
                      <td><Link className="hover:underline" href={`/courses/${courseId}/${ITEM_PATHS[i.kind]}/${i.id}`}>{i.title}</Link></td>
                      <td className="muted capitalize">{i.kind === "scorm" ? "SCORM" : i.kind}</td>
                      <td className="muted">{i.dueAt ? <LocalTime date={i.dueAt} mode="date" /> : "—"}</td>
                      <td className="muted">{i.weight}</td>
                      <td>{i.status === "in-progress" ? <Pill tone="brand">In progress</Pill> : i.status === "submitted" ? <Pill tone="brand">Awaiting grade</Pill> : <Pill tone={gradeTone(i.percent)}>{i.percent !== null ? `${i.percent}%` : "Not started"}</Pill>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    );
  }

  const enrollments = await db.enrollment.findMany({ where: { courseId }, include: { user: { select: { id: true, name: true, avatarUrl: true } } }, orderBy: { user: { name: "asc" } } });
  const reports = await courseReports(courseId, enrollments.map((e) => e.userId));
  const columns = reports.values().next().value?.items ?? [];

  return (
    <Card title="Gradebook" action={<a href={`/api/courses/${courseId}/gradebook`} className="btn-secondary btn-sm">⬇ Export CSV</a>}>
      {enrollments.length === 0 ? (
        <EmptyState icon="👥" title="No students enrolled" />
      ) : (
        <div className="-mx-5 overflow-x-auto px-5">
          <table className="data-table min-w-max">
            <thead>
              <tr>
                <th className="sticky left-0 bg-white dark:bg-slate-900">Student</th>
                <th>Progress</th>
                {columns.map((c) => <th key={c.id} title={c.title} className="max-w-[120px] truncate">{ITEM_ICONS[c.kind]} {c.title}</th>)}
                <th>Grade</th>
              </tr>
            </thead>
            <tbody>
              {enrollments.map(({ user: s }) => {
                const r = reports.get(s.id)!;
                return (
                  <tr key={s.id}>
                    <td className="sticky left-0 bg-white dark:bg-slate-900">
                      <span className="flex items-center gap-2"><Avatar name={s.name} url={s.avatarUrl} size={24} />{s.name}</span>
                    </td>
                    <td className="w-32"><div className="flex items-center gap-2"><ProgressBar value={r.progress} /><span className="text-xs">{r.progress}%</span></div></td>
                    {r.items.map((i) => (
                      <td key={i.id}>{i.status === "in-progress" ? <Pill>In progress</Pill> : i.status === "submitted" ? <Pill tone="brand">To grade</Pill> : i.percent !== null ? <Pill tone={gradeTone(i.percent)}>{i.percent}%</Pill> : <span className="muted">—</span>}</td>
                    ))}
                    <td className="font-bold">{r.grade !== null ? `${r.grade}% (${letterGrade(r.grade)})` : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
