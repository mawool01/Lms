import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { AppStatusPill } from "@/components/cert/cert-ui";
import { LocalTime } from "@/components/forms";
import { Card, EmptyState, PageHeader, Pill } from "@/components/ui";

export const metadata = { title: "Certification reviews" };

export default async function ReviewQueuePage() {
  const user = await requireUser();
  const reviews = await db.certReview.findMany({
    where: { reviewerId: user.id },
    include: { application: { include: { program: true, level: true, applicant: { select: { name: true } } } } },
    orderBy: { assignedAt: "desc" },
  });
  const open = reviews.filter((r) => !r.submittedAt && ["SUBMITTED", "UNDER_REVIEW"].includes(r.application.status));
  const rest = reviews.filter((r) => !open.includes(r));

  const row = (r: (typeof reviews)[number]) => (
    <li key={r.id}>
      <Link href={`/certifications/review/${r.applicationId}`} className="flex flex-wrap items-center gap-3 py-3 hover:opacity-80">
        <div className="min-w-0 flex-1">
          <p className="font-medium">{r.application.applicant.name}{r.application.centerName && ` — ${r.application.centerName}`}</p>
          <p className="muted text-xs">{r.application.program.name} · {r.application.level.name} · assigned <LocalTime date={r.assignedAt} mode="date" /></p>
        </div>
        {r.submittedAt ? <Pill tone="green">Review submitted</Pill> : <Pill tone="yellow">To do</Pill>}
        <AppStatusPill status={r.application.status} />
      </Link>
    </li>
  );

  return (
    <>
      <PageHeader title="Certification reviews" subtitle="Applications you've been asked to review." />
      <Card title={`To review (${open.length})`} className="mb-6">
        {open.length ? <ul className="divide-y divide-slate-100 dark:divide-slate-800">{open.map(row)}</ul> : <EmptyState icon="✅" title="You're all caught up" />}
      </Card>
      {rest.length > 0 && (
        <Card title="Completed & closed">
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">{rest.map(row)}</ul>
        </Card>
      )}
    </>
  );
}
