import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { loadDefaultPrograms, saveProgram } from "@/lib/actions/certifications";
import { ProgramForm } from "@/components/cert/program-forms";
import { Card, EmptyState, Pill } from "@/components/ui";

export default async function ProgramsPage() {
  await requireRole("ADMIN");
  const programs = await db.certProgram.findMany({
    orderBy: { position: "asc" },
    include: { _count: { select: { levels: true, criteria: true, applications: true, certifications: true } } },
  });
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-3 lg:col-span-2">
        {programs.length === 0 && (
          <EmptyState icon="🎖️" title="No programs yet">
            <form action={loadDefaultPrograms} className="mt-3">
              <button className="btn-primary">Load ICLCA defaults (LCLC + Learning Center Certification)</button>
            </form>
            <p className="mt-2">Placeholders you can then edit to match current requirements.</p>
          </EmptyState>
        )}
        {programs.map((p) => (
          <Link key={p.id} href={`/admin/certifications/programs/${p.id}`} className="card block p-4 transition hover:shadow-md">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold">{p.name}</p>
              <Pill tone={p.kind === "CENTER" ? "purple" : "brand"}>{p.kind === "CENTER" ? "Centers" : "Individuals"}</Pill>
              {!p.active && <Pill tone="yellow">Closed</Pill>}
            </div>
            <p className="muted mt-1 text-xs">
              key <code>{p.key}</code> · {p._count.levels} levels · {p._count.criteria} criteria · {p._count.applications} applications · {p._count.certifications} certified
            </p>
          </Link>
        ))}
        {programs.length > 0 && (
          <form action={loadDefaultPrograms}>
            <button className="muted text-xs hover:underline">Add any missing ICLCA default programs</button>
          </form>
        )}
      </div>
      <Card title="New program">
        <ProgramForm action={saveProgram.bind(null, null)} />
      </Card>
    </div>
  );
}
