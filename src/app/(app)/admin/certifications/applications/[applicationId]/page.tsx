import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { criteriaFor, getApplicationAccess } from "@/lib/certifications/access";
import { assignReviewer, decideApplication, setFeePaid, unassignReviewer } from "@/lib/actions/certifications";
import { RATING_LABELS } from "@/lib/certifications/status";
import { ApplicationResponses, MessageThread, ReviewSummary } from "@/components/cert/application-view";
import { AppStatusPill, VerifyLink } from "@/components/cert/cert-ui";
import { ActionForm, LocalTime, SubmitButton } from "@/components/forms";
import { Card, Pill } from "@/components/ui";

export default async function AdminApplicationPage({ params }: { params: Promise<{ applicationId: string }> }) {
  const { applicationId } = await params;
  const admin = await requireRole("ADMIN");
  const { app } = await getApplicationAccess(admin, applicationId);
  const [criteria, responses, reviewers, certification, previous] = await Promise.all([
    criteriaFor(app.programId, app.levelId),
    db.certResponse.findMany({ where: { applicationId } }),
    db.user.findMany({ where: { certReviewer: true, active: true, NOT: { id: app.applicantId } }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.certification.findUnique({ where: { applicationId } }),
    app.renewsCertificationId ? db.certification.findUnique({ where: { id: app.renewsCertificationId } }) : null,
  ]);
  const assigned = new Set(app.reviews.map((r) => r.reviewerId));
  const open = ["SUBMITTED", "UNDER_REVIEW", "CHANGES_REQUESTED"].includes(app.status);
  const submittedReviews = app.reviews.filter((r) => r.submittedAt);

  // Tally ratings across reviewers.
  const tally = { DOES_NOT_MEET: 0, MEETS: 0, EXCEEDS: 0 };
  submittedReviews.forEach((r) => r.scores.forEach((s) => tally[s.rating]++));

  return (
    <div className="space-y-6">
      <Link href="/admin/certifications" className="link text-sm">← All applications</Link>
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-2xl font-bold">{app.applicant.name}{app.centerName && ` — ${app.centerName}`}</h2>
            <p className="muted">{app.program.name} · {app.level.name}{app.type === "RENEWAL" && " · Renewal"}</p>
            <p className="muted text-sm">{app.applicant.email}{app.institution && ` · ${app.institution}`}{app.applicant.jobTitle && ` · ${app.applicant.jobTitle}`}</p>
            {previous && <p className="muted text-xs">Renews certification <VerifyLink code={previous.code} /></p>}
          </div>
          <AppStatusPill status={app.status} />
        </div>
        <p className="muted mt-2 text-xs">{app.submittedAt ? <>Submitted <LocalTime date={app.submittedAt} /></> : "Draft — not submitted"}</p>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Fee">
          <ActionForm action={setFeePaid.bind(null, applicationId)} className="space-y-3">
            <label className="flex items-center gap-2"><input type="checkbox" name="feePaid" defaultChecked={app.feePaid} /> Fee received</label>
            <input name="feeNote" defaultValue={app.feeNote} placeholder="Note (e.g. Square receipt #, date)" aria-label="Fee note" />
            <SubmitButton className="btn-secondary btn-sm">Save</SubmitButton>
          </ActionForm>
        </Card>

        <Card title={`Review committee (${app.reviews.length})`} className="lg:col-span-2">
          {app.reviews.length < 3 && open && <p className="mb-3 text-xs text-amber-600">ICLCA recommends at least three reviewers.</p>}
          <ul className="mb-4 space-y-2">
            {app.reviews.map((r) => (
              <li key={r.id} className="flex items-center gap-3 text-sm">
                <span className="flex-1 font-medium">{r.reviewer.name}</span>
                {r.submittedAt ? <Pill tone="green">Submitted</Pill> : <Pill>Pending</Pill>}
                {open && <form action={unassignReviewer.bind(null, r.id)}><button className="muted text-xs hover:text-red-600">Remove</button></form>}
              </li>
            ))}
            {app.reviews.length === 0 && <li className="muted text-sm">No reviewers assigned yet.</li>}
          </ul>
          {open && (
            <ActionForm action={assignReviewer.bind(null, applicationId)} className="flex flex-col gap-2 sm:flex-row">
              <select name="reviewerId" defaultValue="" aria-label="Reviewer" required>
                <option value="" disabled>Choose a reviewer…</option>
                {reviewers.filter((r) => !assigned.has(r.id)).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
              <SubmitButton className="btn-primary shrink-0">Assign</SubmitButton>
            </ActionForm>
          )}
          {reviewers.length === 0 && <p className="muted mt-2 text-xs">No reviewers yet — mark people as reviewers on the <Link href="/admin/certifications/reviewers" className="link">Reviewers</Link> tab.</p>}
        </Card>
      </div>

      <Card title="Review results" action={submittedReviews.length > 0 && <span className="flex gap-1">{(Object.keys(tally) as (keyof typeof tally)[]).map((k) => <Pill key={k} tone={RATING_LABELS[k].tone}>{RATING_LABELS[k].label}: {tally[k]}</Pill>)}</span>}>
        <ReviewSummary criteria={criteria} reviews={app.reviews} />
      </Card>

      {open ? (
        <Card title="Decision">
          <ActionForm action={decideApplication.bind(null, applicationId)} className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {[
                ["approve", "✅ Approve & issue certification"],
                ["changes", "✏️ Request changes / more information"],
                ["deny", "✖ Do not approve"],
              ].map(([value, label]) => (
                <label key={value} className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal has-[:checked]:border-brand-500 has-[:checked]:ring-2 has-[:checked]:ring-brand-500/30 dark:border-slate-700">
                  <input type="radio" name="decision" value={value} required /> {label}
                </label>
              ))}
            </div>
            <textarea name="note" rows={4} placeholder="Message to the applicant (required when requesting changes)" aria-label="Decision note" />
            {!app.feePaid && (
              <label className="flex items-center gap-2 text-sm font-normal"><input type="checkbox" name="ignoreFee" /> Approve without a confirmed fee payment</label>
            )}
            <SubmitButton>Save decision</SubmitButton>
          </ActionForm>
        </Card>
      ) : (
        <Card title="Decision">
          <p className="text-sm">
            <AppStatusPill status={app.status} /> {app.decidedAt && <span className="muted">on <LocalTime date={app.decidedAt} /></span>}
          </p>
          {app.decisionNote && <p className="mt-2 text-sm whitespace-pre-wrap">{app.decisionNote}</p>}
          {certification && (
            <p className="mt-2 text-sm">
              Certification issued: <VerifyLink code={certification.code} /> · <a className="link" href={`/certifications/${certification.id}/certificate`}>PDF</a>
            </p>
          )}
        </Card>
      )}

      <h3 className="text-lg font-semibold">Application</h3>
      <ApplicationResponses statement={app.statement} criteria={criteria} responses={responses} />
      <MessageThread applicationId={applicationId} staff />
    </div>
  );
}
