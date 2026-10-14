import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { blobClientConfig } from "@/lib/blob";
import { criteriaFor, getApplicationAccess, isEditable } from "@/lib/certifications/access";
import { withdrawApplication } from "@/lib/actions/certifications";
import { ApplicationEditor } from "@/components/cert/application-editor";
import { ApplicationResponses, MessageThread, ReviewSummary } from "@/components/cert/application-view";
import { AppStatusPill, StatusTimeline } from "@/components/cert/cert-ui";
import { LocalTime } from "@/components/forms";
import { Markdown } from "@/components/markdown";
import { Card } from "@/components/ui";

export default async function ApplicationPage({ params }: { params: Promise<{ applicationId: string }> }) {
  const { applicationId } = await params;
  const user = await requireUser();
  const { app, isApplicant, isAdmin } = await getApplicationAccess(user, applicationId);
  // Staff use their own views.
  if (!isApplicant) redirect(isAdmin ? `/admin/certifications/applications/${applicationId}` : `/certifications/review/${applicationId}`);

  const [criteria, responses, certification] = await Promise.all([
    criteriaFor(app.programId, app.levelId),
    db.certResponse.findMany({ where: { applicationId } }),
    db.certification.findUnique({ where: { applicationId } }),
  ]);
  const editable = isEditable(app.status);
  const decided = ["CHANGES_REQUESTED", "APPROVED", "DENIED"].includes(app.status);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link href="/certifications" className="link text-sm">← Certifications</Link>
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">{app.program.name}</h1>
            <p className="muted">{app.level.name}{app.type === "RENEWAL" && " · Renewal"}{app.centerName && ` · ${app.centerName}`}{app.institution && `, ${app.institution}`}</p>
          </div>
          <AppStatusPill status={app.status} />
        </div>
        <div className="mt-4 overflow-x-auto"><StatusTimeline status={app.status} /></div>
        <p className="muted mt-3 text-xs">
          {app.submittedAt ? <>Submitted <LocalTime date={app.submittedAt} /></> : "Not submitted yet"} · Fee {app.feePaid ? "received ✓" : "not yet confirmed — pay through ICLCA's online store"}
        </p>
      </Card>

      {(app.status === "SUBMITTED" || app.status === "UNDER_REVIEW") && (
        <Card title="✅ Application submitted" className="border-emerald-300 dark:border-emerald-800">
          <p className="text-sm">
            Thank you! {app.status === "UNDER_REVIEW" ? "The review committee is evaluating your application." : "An ICLCA administrator will assign it to the review committee."} You&apos;ll be notified here{" "}
            and by email if the committee needs anything else or when a decision is made.
          </p>
        </Card>
      )}
      {app.status === "CHANGES_REQUESTED" && app.decisionNote && (
        <Card title="⚠️ Changes requested" className="border-amber-300 dark:border-amber-800">
          <Markdown>{app.decisionNote}</Markdown>
          <p className="muted mt-2 text-xs">Update your responses below and submit again.</p>
        </Card>
      )}
      {app.status === "APPROVED" && (
        <Card title="🎉 Approved" className="border-emerald-300 dark:border-emerald-800">
          {app.decisionNote && <Markdown>{app.decisionNote}</Markdown>}
          {certification && (
            <div className="mt-2 flex flex-wrap gap-2">
              <a href={`/certifications/${certification.id}/certificate`} className="btn-primary">⬇ Download certificate</a>
              <Link href={`/verify/${certification.code}`} className="btn-secondary">Verification page</Link>
            </div>
          )}
        </Card>
      )}
      {app.status === "DENIED" && (
        <Card title="Decision">
          <p>This application was not approved at this time.</p>
          {app.decisionNote && <div className="mt-2"><Markdown>{app.decisionNote}</Markdown></div>}
        </Card>
      )}

      {editable ? (
        <ApplicationEditor
          applicationId={app.id}
          kind={app.program.kind}
          criteria={criteria}
          initial={{ statement: app.statement, centerName: app.centerName, institution: app.institution, responses }}
          blob={blobClientConfig()}
          userId={user.id}
        />
      ) : (
        <ApplicationResponses statement={app.statement} criteria={criteria} responses={responses} />
      )}

      {decided && app.reviews.some((r) => r.submittedAt) && (
        <Card title="Committee feedback">
          <ReviewSummary criteria={criteria} reviews={app.reviews} anonymous />
        </Card>
      )}

      {app.status !== "DRAFT" && <MessageThread applicationId={app.id} staff={false} />}

      {!["APPROVED", "DENIED", "WITHDRAWN"].includes(app.status) && (
        <form action={withdrawApplication.bind(null, app.id)} className="text-center">
          <button className="muted text-xs hover:text-red-600">{app.status === "DRAFT" ? "Delete this draft" : "Withdraw application"}</button>
        </form>
      )}
    </div>
  );
}
