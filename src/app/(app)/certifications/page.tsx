import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getBranding } from "@/lib/branding";
import { setDirectoryVisibility, startApplication } from "@/lib/actions/certifications";
import { certState } from "@/lib/certifications/status";
import { AppStatusPill, CertStatePill, VerifyLink, expiryText } from "@/components/cert/cert-ui";
import { ActionForm, LocalTime, SubmitButton } from "@/components/forms";
import { Markdown } from "@/components/markdown";
import { Card, EmptyState, PageHeader, Pill } from "@/components/ui";

export const metadata = { title: "Certifications" };

export default async function CertificationsPage() {
  const user = await requireUser();
  const branding = await getBranding();
  const [programs, applications, certifications, reviewCount] = await Promise.all([
    db.certProgram.findMany({ where: { active: true }, orderBy: { position: "asc" }, include: { levels: { where: { active: true }, orderBy: { position: "asc" } } } }),
    db.certApplication.findMany({ where: { applicantId: user.id }, include: { program: true, level: true }, orderBy: { updatedAt: "desc" } }),
    db.certification.findMany({ where: { holderId: user.id }, include: { program: true, level: true }, orderBy: { issuedAt: "desc" } }),
    db.certReview.count({ where: { reviewerId: user.id, submittedAt: null, application: { status: { in: ["SUBMITTED", "UNDER_REVIEW"] } } } }),
  ]);

  return (
    <>
      <PageHeader
        title={`${branding.shortName} Certifications`}
        subtitle="Apply for the Learning Center Leadership Certification and Learning Center of Excellence, track your applications and download your certificates."
        actions={
          <>
            {reviewCount > 0 && <Link href="/certifications/review" className="btn-primary">📝 Reviews to do ({reviewCount})</Link>}
            {user.role === "ADMIN" && <Link href="/admin/certifications" className="btn-secondary">Manage certifications</Link>}
            <Link href="/directory" className="btn-secondary">Public directory</Link>
          </>
        }
      />

      {certifications.length > 0 && (
        <Card title="My certifications" className="mb-6">
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {certifications.map((c) => {
              const state = certState(c);
              const pendingRenewal = applications.some((a) => a.renewsCertificationId === c.id && !["APPROVED", "DENIED", "WITHDRAWN"].includes(a.status));
              return (
                <li key={c.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center">
                  <span className="text-3xl">🎖️</span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{c.program.name} — {c.level.name}</p>
                    {c.centerName && <p className="text-sm">{c.centerName}{c.institution && `, ${c.institution}`}</p>}
                    <p className="muted text-xs">Issued <LocalTime date={c.issuedAt} mode="date" /> · {expiryText(c)} · code <VerifyLink code={c.code} /></p>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <CertStatePill cert={c} />
                      <form action={setDirectoryVisibility.bind(null, c.id, !c.showInDirectory)}>
                        <button className="muted text-xs hover:underline">{c.showInDirectory ? "Listed in public directory · hide" : "Hidden from directory · show"}</button>
                      </form>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {state !== "revoked" && <a href={`/certifications/${c.id}/certificate`} className="btn-secondary btn-sm">⬇ Certificate (PDF)</a>}
                    {(state === "expiring" || state === "expired") && !pendingRenewal && (
                      <ActionForm action={startApplication.bind(null, c.programId)}>
                        <input type="hidden" name="levelId" value={c.levelId} />
                        <input type="hidden" name="renewsCertificationId" value={c.id} />
                        <input type="hidden" name="centerName" value={c.centerName ?? ""} />
                        <input type="hidden" name="institution" value={c.institution ?? ""} />
                        <SubmitButton className="btn-primary btn-sm">Renew</SubmitButton>
                      </ActionForm>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {applications.length > 0 && (
        <Card title="My applications" className="mb-6">
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {applications.map((a) => (
              <li key={a.id}>
                <Link href={`/certifications/applications/${a.id}`} className="flex flex-wrap items-center gap-3 py-3 hover:opacity-80">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{a.program.name} — {a.level.name}{a.type === "RENEWAL" && " (renewal)"}</p>
                    <p className="muted text-xs">{a.centerName ? `${a.centerName} · ` : ""}{a.submittedAt ? <>Submitted <LocalTime date={a.submittedAt} mode="date" /></> : "Not submitted yet"}</p>
                  </div>
                  <AppStatusPill status={a.status} />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <h2 className="mb-3 text-lg font-semibold">Programs</h2>
      {programs.length === 0 ? (
        <EmptyState icon="🎖️" title="No certification programs yet">
          {user.role === "ADMIN" ? <>Set them up in <Link href="/admin/certifications/programs" className="link">Admin → Certifications</Link>.</> : "Check back soon."}
        </EmptyState>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          {programs.map((p) => (
            <Card key={p.id}>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <Pill tone={p.kind === "CENTER" ? "purple" : "brand"}>{p.kind === "CENTER" ? "For learning centers" : "For individuals"}</Pill>
              </div>
              <h3 className="text-lg font-bold">{p.name}</h3>
              <div className="mt-2 text-sm"><Markdown>{p.description}</Markdown></div>
              <details className="mt-3">
                <summary className="link cursor-pointer text-sm">Levels & requirements</summary>
                <ul className="mt-3 space-y-3">
                  {p.levels.map((l) => (
                    <li key={l.id} className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                      <p className="font-semibold">{l.name}{l.lifetime && <span className="ml-2"><Pill tone="purple">Lifetime</Pill></span>}</p>
                      <div className="text-sm"><Markdown>{l.description}</Markdown></div>
                      {l.feeNote && <p className="muted mt-1 text-xs">Fee: {l.feeNote}</p>}
                    </li>
                  ))}
                </ul>
              </details>
              <Link href={`/certifications/apply/${p.key}`} className="btn-primary mt-4">Apply</Link>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
