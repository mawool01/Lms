import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { moveCriterion, saveCriterion, saveLevel, saveProgram } from "@/lib/actions/certifications";
import { CriterionForm, LevelForm, ProgramForm } from "@/components/cert/program-forms";
import { Card, Pill } from "@/components/ui";

export default async function ProgramEditorPage({ params }: { params: Promise<{ programId: string }> }) {
  const { programId } = await params;
  await requireRole("ADMIN");
  const program = await db.certProgram.findUnique({
    where: { id: programId },
    include: {
      levels: { orderBy: { position: "asc" } },
      criteria: { orderBy: [{ position: "asc" }, { id: "asc" }], include: { level: { select: { name: true } } } },
    },
  });
  if (!program) notFound();

  return (
    <div className="space-y-6">
      <Link href="/admin/certifications/programs" className="link text-sm">← All programs</Link>
      <Card title="Program">
        <ProgramForm action={saveProgram.bind(null, program.id)} values={program} />
        <p className="muted mt-3 text-xs">Apply link: <code>/certifications/apply/{program.key}</code></p>
      </Card>

      <Card title={`Levels (${program.levels.length})`}>
        <div className="space-y-4">
          {program.levels.map((l) => (
            <details key={l.id} className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
              <summary className="flex cursor-pointer list-none items-center gap-2 font-medium">
                {l.name} {l.lifetime && <Pill tone="purple">Lifetime</Pill>} {!l.active && <Pill tone="yellow">Hidden</Pill>}
              </summary>
              <div className="mt-3"><LevelForm action={saveLevel.bind(null, program.id, l.id)} values={l} /></div>
            </details>
          ))}
          <div className="rounded-xl border border-dashed border-slate-300 p-3 dark:border-slate-700">
            <LevelForm action={saveLevel.bind(null, program.id, null)} />
          </div>
        </div>
      </Card>

      <Card title={`Criteria / standards (${program.criteria.length})`}>
        <p className="muted mb-3 text-sm">Applicants answer each active criterion with a narrative (and evidence if required). Reviewers rate each one as does not meet / meets / exceeds.</p>
        <div className="space-y-3">
          {program.criteria.map((c, i) => (
            <details key={c.id} className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
              <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2">
                <span className="flex-1 font-medium">{i + 1}. {c.section && <span className="muted">{c.section} · </span>}{c.title}</span>
                {c.level && <Pill>{c.level.name} only</Pill>}
                {!c.evidenceRequired && <Pill>No evidence needed</Pill>}
                {!c.active && <Pill tone="yellow">Inactive</Pill>}
                <form action={moveCriterion.bind(null, c.id, -1)}><button className="btn-ghost btn-sm" disabled={i === 0} aria-label="Move up">↑</button></form>
                <form action={moveCriterion.bind(null, c.id, 1)}><button className="btn-ghost btn-sm" disabled={i === program.criteria.length - 1} aria-label="Move down">↓</button></form>
              </summary>
              <div className="mt-3"><CriterionForm action={saveCriterion.bind(null, program.id, c.id)} levels={program.levels} values={c} /></div>
            </details>
          ))}
          <div className="rounded-xl border border-dashed border-slate-300 p-3 dark:border-slate-700">
            <CriterionForm action={saveCriterion.bind(null, program.id, null)} levels={program.levels} />
          </div>
        </div>
      </Card>
    </div>
  );
}
