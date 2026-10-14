import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { createRubric } from "@/lib/actions/rubrics";
import { parseCriteria, rubricMax } from "@/lib/rubrics";
import { Card, EmptyState, PageHeader, Pill } from "@/components/ui";

export const metadata = { title: "Rubrics" };

export default async function RubricsPage() {
  const user = await requireRole("ADMIN", "TEACHER");
  const rubrics = await db.rubric.findMany({
    where: user.role === "ADMIN" ? {} : { OR: [{ ownerId: user.id }, { shared: true }] },
    include: { owner: { select: { name: true } }, _count: { select: { assignments: true, questions: true } } },
    orderBy: [{ updatedAt: "desc" }],
  });
  const mine = rubrics.filter((r) => r.ownerId === user.id);
  const others = rubrics.filter((r) => r.ownerId !== user.id);

  const list = (items: typeof rubrics) => (
    <ul className="divide-y divide-slate-100 dark:divide-slate-800">
      {items.map((r) => {
        const criteria = parseCriteria(r.criteria);
        const uses = r._count.assignments + r._count.questions;
        return (
          <li key={r.id} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <Link href={`/rubrics/${r.id}`} className="font-medium hover:underline">{r.title}</Link>
              <p className="muted text-xs">
                {criteria.length} criteria · {rubricMax(criteria)} pts · used {uses} {uses === 1 ? "time" : "times"}
                {r.ownerId !== user.id && ` · by ${r.owner.name}`}
              </p>
            </div>
            {r.shared && <Pill tone="brand">Shared site-wide</Pill>}
          </li>
        );
      })}
    </ul>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Grading rubrics"
        subtitle="Build a rubric once and attach it to any assignment or essay question. Learners see it up front and get the scored rubric back with their grade."
        actions={<form action={createRubric}><button className="btn-primary">+ New rubric</button></form>}
      />
      <Card title="My rubrics">
        {mine.length ? list(mine) : <EmptyState icon="📏" title="No rubrics yet">Create one, or duplicate a shared rubric below.</EmptyState>}
      </Card>
      {others.length > 0 && <Card title={user.role === "ADMIN" ? "Other teachers' rubrics" : "Shared rubrics"}>{list(others)}</Card>}
    </div>
  );
}
