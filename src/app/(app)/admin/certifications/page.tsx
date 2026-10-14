import Link from "next/link";
import type { CertApplicationStatus, Prisma } from "@prisma/client";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { STATUS_LABELS } from "@/lib/certifications/status";
import { AppStatusPill } from "@/components/cert/cert-ui";
import { LocalTime } from "@/components/forms";
import { Card, EmptyState, Pill, Stat } from "@/components/ui";

export default async function CertApplicationsAdmin({ searchParams }: { searchParams: Promise<{ status?: string; program?: string; q?: string }> }) {
  await requireRole("ADMIN");
  const { status = "open", program = "", q = "" } = await searchParams;
  const openStatuses: CertApplicationStatus[] = ["SUBMITTED", "UNDER_REVIEW", "CHANGES_REQUESTED"];
  const where: Prisma.CertApplicationWhereInput = {
    status: status === "open" ? { in: openStatuses } : status === "all" ? { not: "DRAFT" } : (status as CertApplicationStatus),
    ...(program ? { programId: program } : {}),
    ...(q ? { OR: [{ applicant: { name: { contains: q, mode: "insensitive" } } }, { centerName: { contains: q, mode: "insensitive" } }, { institution: { contains: q, mode: "insensitive" } }] } : {}),
  };
  const [apps, programs, counts] = await Promise.all([
    db.certApplication.findMany({
      where,
      orderBy: [{ submittedAt: { sort: "asc", nulls: "last" } }],
      include: { program: true, level: true, applicant: { select: { name: true, email: true } }, reviews: { select: { submittedAt: true } } },
      take: 300,
    }),
    db.certProgram.findMany({ orderBy: { position: "asc" } }),
    db.certApplication.groupBy({ by: ["status"], _count: true }),
  ]);
  const count = (s: CertApplicationStatus) => counts.find((c) => c.status === s)?._count ?? 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="New (unassigned)" value={count("SUBMITTED")} icon="📥" />
        <Stat label="Under review" value={count("UNDER_REVIEW")} icon="🔍" />
        <Stat label="Waiting on applicant" value={count("CHANGES_REQUESTED")} icon="⏳" />
        <Stat label="Approved" value={count("APPROVED")} icon="🎖️" />
      </div>
      {programs.length === 0 && (
        <Card>
          <p>No programs are set up yet. <Link href="/admin/certifications/programs" className="link">Set up programs</Link> (you can load ICLCA&apos;s defaults in one click).</p>
        </Card>
      )}
      <Card>
        <form className="mb-4 flex flex-col gap-2 sm:flex-row">
          <input name="q" defaultValue={q} placeholder="Search applicant, center or institution" />
          <select name="status" defaultValue={status} className="sm:w-48">
            <option value="open">Open (needs action)</option>
            <option value="all">All submitted</option>
            {(Object.keys(STATUS_LABELS) as CertApplicationStatus[]).map((s) => <option key={s} value={s}>{STATUS_LABELS[s].label}</option>)}
          </select>
          <select name="program" defaultValue={program} className="sm:w-64">
            <option value="">All programs</option>
            {programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <button className="btn-secondary">Filter</button>
        </form>
        {apps.length === 0 ? (
          <EmptyState icon="📭" title="No applications match" />
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead><tr><th>Applicant</th><th>Program / level</th><th>Submitted</th><th>Fee</th><th>Reviews</th><th>Status</th></tr></thead>
              <tbody>
                {apps.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <Link href={`/admin/certifications/applications/${a.id}`} className="font-medium hover:underline">{a.applicant.name}</Link>
                      {a.centerName && <p className="muted text-xs">{a.centerName}</p>}
                    </td>
                    <td className="text-sm">{a.program.name}<p className="muted text-xs">{a.level.name}{a.type === "RENEWAL" && " · renewal"}</p></td>
                    <td className="muted whitespace-nowrap text-xs">{a.submittedAt ? <LocalTime date={a.submittedAt} mode="date" /> : "—"}</td>
                    <td>{a.feePaid ? <Pill tone="green">Paid</Pill> : <Pill tone="yellow">Unpaid</Pill>}</td>
                    <td className="text-sm">{a.reviews.filter((r) => r.submittedAt).length}/{a.reviews.length}</td>
                    <td><AppStatusPill status={a.status} /></td>
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
