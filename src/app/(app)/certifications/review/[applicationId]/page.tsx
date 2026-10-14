import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { criteriaFor, getApplicationAccess } from "@/lib/certifications/access";
import { saveReview } from "@/lib/actions/certifications";
import { RATING_LABELS, RECOMMENDATION_LABELS } from "@/lib/certifications/status";
import { ApplicationResponses, MessageThread } from "@/components/cert/application-view";
import { AppStatusPill } from "@/components/cert/cert-ui";
import { ActionForm, LocalTime, SubmitButton } from "@/components/forms";
import { Card, Pill } from "@/components/ui";

export default async function ReviewPage({ params }: { params: Promise<{ applicationId: string }> }) {
  const { applicationId } = await params;
  const user = await requireUser();
  const { app, myReview, isAdmin } = await getApplicationAccess(user, applicationId);
  if (!myReview && !isAdmin) notFound();
  const [criteria, responses] = await Promise.all([criteriaFor(app.programId, app.levelId), db.certResponse.findMany({ where: { applicationId } })]);
  const open = !!myReview && ["SUBMITTED", "UNDER_REVIEW"].includes(app.status);
  const score = (criterionId: string) => myReview?.scores.find((s) => s.criterionId === criterionId);

  const body = (
    <>
      <ApplicationResponses
        statement={app.statement}
        criteria={criteria}
        responses={responses}
        extra={(c) =>
          myReview && (
            <div className="mt-4 rounded-lg border border-brand-200 bg-brand-50/60 p-3 dark:border-brand-900 dark:bg-brand-950/30">
              <p className="mb-2 text-xs font-semibold">Your rating</p>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(RATING_LABELS) as (keyof typeof RATING_LABELS)[]).map((r) => (
                  <label key={r} className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-normal has-[:checked]:border-brand-500 has-[:checked]:ring-2 has-[:checked]:ring-brand-500/30 dark:border-slate-700 dark:bg-slate-900">
                    <input type="radio" name={`rating_${c.id}`} value={r} defaultChecked={score(c.id)?.rating === r} disabled={!open} />
                    {RATING_LABELS[r].label}
                  </label>
                ))}
              </div>
              <textarea name={`comment_${c.id}`} rows={2} className="mt-2" defaultValue={score(c.id)?.comment ?? ""} placeholder="Comment for this criterion (shared anonymously with the applicant)" disabled={!open} aria-label={`Comment on ${c.title}`} />
            </div>
          )
        }
      />
      {myReview && (
        <Card title="Overall recommendation">
          <div className="flex flex-wrap gap-2">
            {(Object.keys(RECOMMENDATION_LABELS) as (keyof typeof RECOMMENDATION_LABELS)[]).map((r) => (
              <label key={r} className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal has-[:checked]:border-brand-500 has-[:checked]:ring-2 has-[:checked]:ring-brand-500/30 dark:border-slate-700">
                <input type="radio" name="recommendation" value={r} defaultChecked={myReview.recommendation === r} disabled={!open} />
                {RECOMMENDATION_LABELS[r].label}
              </label>
            ))}
          </div>
          <textarea name="comments" rows={4} className="mt-3" defaultValue={myReview.comments} placeholder="Overall feedback and suggestions (shared anonymously with the applicant)" disabled={!open} aria-label="Overall comments" />
          {open && (
            <div className="mt-3 flex flex-wrap gap-2">
              <SubmitButton className="btn-secondary">Save draft</SubmitButton>
              <button type="submit" name="intent" value="submit" className="btn-primary">Submit review</button>
            </div>
          )}
          {myReview.submittedAt && <p className="muted mt-2 text-xs">Submitted <LocalTime date={myReview.submittedAt} />. You can still change it while the application is under review.</p>}
        </Card>
      )}
    </>
  );

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link href="/certifications/review" className="link text-sm">← Review queue</Link>
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">{app.applicant.name}{app.centerName && ` — ${app.centerName}`}</h1>
            <p className="muted">{app.program.name} · {app.level.name}{app.type === "RENEWAL" && " · Renewal"}{app.institution && ` · ${app.institution}`}</p>
          </div>
          <div className="flex gap-2"><AppStatusPill status={app.status} />{myReview?.submittedAt && <Pill tone="green">Your review is in</Pill>}</div>
        </div>
        <p className="muted mt-2 text-sm">Rate each criterion as <b>does not meet</b>, <b>meets</b> or <b>exceeds</b> the standard, then give an overall recommendation. Comments are shared with the applicant without your name.</p>
      </Card>
      {open ? <ActionForm action={saveReview.bind(null, applicationId)} className="space-y-6">{body}</ActionForm> : body}
      <MessageThread applicationId={applicationId} staff />
    </div>
  );
}
