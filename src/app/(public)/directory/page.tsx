import Link from "next/link";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/utils";
import { Card, EmptyState, Pill } from "@/components/ui";

export const metadata = { title: "Certified Directory", description: "ICLCA certified learning center professionals and Learning Centers of Excellence." };

export default async function DirectoryPage({ searchParams }: { searchParams: Promise<{ q?: string; program?: string }> }) {
  const { q = "", program = "" } = await searchParams;
  const now = new Date();
  const [programs, certs] = await Promise.all([
    db.certProgram.findMany({ orderBy: { position: "asc" }, select: { id: true, key: true, name: true, kind: true } }),
    db.certification.findMany({
      where: {
        showInDirectory: true,
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gte: now } }],
        ...(program ? { program: { key: program } } : {}),
        ...(q
          ? { AND: [{ OR: [{ holderName: { contains: q, mode: "insensitive" } }, { centerName: { contains: q, mode: "insensitive" } }, { institution: { contains: q, mode: "insensitive" } }] }] }
          : {}),
      },
      include: { program: { select: { name: true, kind: true } }, level: { select: { name: true, position: true } } },
      orderBy: [{ level: { position: "desc" } }, { holderName: "asc" }],
      take: 1000,
    }),
  ]);
  const centers = certs.filter((c) => c.program.kind === "CENTER");
  const people = certs.filter((c) => c.program.kind === "INDIVIDUAL");

  const entry = (c: (typeof certs)[number]) => (
    <li key={c.id} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:gap-4">
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{c.program.kind === "CENTER" ? c.centerName : c.holderName}</p>
        <p className="muted text-sm">{c.program.kind === "CENTER" ? c.institution : c.institution ?? ""}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Pill tone={c.program.kind === "CENTER" ? "purple" : "brand"}>{c.level.name}</Pill>
        <span className="muted">since {formatDate(c.issuedAt, { year: "numeric", month: "short" })}</span>
        <Link href={`/verify/${c.code}`} className="link">verify</Link>
      </div>
    </li>
  );

  return (
    <>
      <h1 className="text-3xl font-bold">Certified Directory</h1>
      <p className="muted mt-1 mb-6">Learning center professionals and centers currently holding ICLCA certifications.</p>
      <form className="mb-6 flex flex-col gap-2 sm:flex-row">
        <input name="q" defaultValue={q} placeholder="Search by name, center or institution" />
        <select name="program" defaultValue={program} className="sm:w-80">
          <option value="">All programs</option>
          {programs.map((p) => <option key={p.id} value={p.key}>{p.name}</option>)}
        </select>
        <button className="btn-secondary">Search</button>
      </form>
      {certs.length === 0 ? (
        <EmptyState icon="🔎" title="No certified entries found" />
      ) : (
        <div className="space-y-6">
          {centers.length > 0 && (
            <Card title={`🏛️ Certified learning centers (${centers.length})`}>
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">{centers.map(entry)}</ul>
            </Card>
          )}
          {people.length > 0 && (
            <Card title={`🎖️ Certified professionals (${people.length})`}>
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">{people.map(entry)}</ul>
            </Card>
          )}
        </div>
      )}
    </>
  );
}
