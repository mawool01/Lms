import type { CertRating } from "@prisma/client";
import { db } from "@/lib/db";
import { postCertMessage } from "@/lib/actions/certifications";
import { RATING_LABELS, RECOMMENDATION_LABELS, evidenceName } from "@/lib/certifications/status";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Markdown } from "@/components/markdown";
import { Avatar, Card, Pill } from "@/components/ui";
import { timeAgo } from "@/lib/utils";

type Criterion = { id: string; section: string; title: string; guidance: string; evidenceRequired: boolean };
type Response = { criterionId: string; narrative: string; evidence: string[] };

/** Read-only display of an application's statement and per-criterion responses. */
export function ApplicationResponses({
  statement,
  criteria,
  responses,
  extra,
}: {
  statement: string;
  criteria: Criterion[];
  responses: Response[];
  /** Optional content rendered under each criterion (e.g. reviewer scoring controls). */
  extra?: (criterion: Criterion) => React.ReactNode;
}) {
  let lastSection = "";
  return (
    <div className="space-y-4">
      {statement && (
        <Card title="Introduction">
          <Markdown>{statement}</Markdown>
        </Card>
      )}
      {criteria.map((c, i) => {
        const r = responses.find((x) => x.criterionId === c.id);
        const header = c.section && c.section !== lastSection ? c.section : null;
        lastSection = c.section;
        return (
          <div key={c.id}>
            {header && <h3 className="mt-6 mb-2 text-sm font-semibold tracking-wide text-slate-500 uppercase">{header}</h3>}
            <section className="card p-5">
              <h4 className="font-semibold">{i + 1}. {c.title}</h4>
              {c.guidance && <div className="muted mt-1 text-xs"><Markdown>{c.guidance}</Markdown></div>}
              <div className="mt-3 rounded-lg border border-slate-100 p-3 dark:border-slate-800">
                {r?.narrative ? <Markdown>{r.narrative}</Markdown> : <p className="muted text-sm italic">No response.</p>}
              </div>
              {r && r.evidence.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {r.evidence.map((e, j) => (
                    <li key={j} className="text-sm">
                      📎 <a href={e} target="_blank" rel="noopener noreferrer" className="link break-all">{evidenceName(e)}</a>
                    </li>
                  ))}
                </ul>
              )}
              {extra?.(c)}
            </section>
          </div>
        );
      })}
    </div>
  );
}

type ReviewWithScores = {
  id: string;
  reviewer: { id: string; name: string };
  recommendation: keyof typeof RECOMMENDATION_LABELS | null;
  comments: string;
  submittedAt: Date | null;
  scores: { criterionId: string; rating: CertRating; comment: string }[];
};

/**
 * Committee results per criterion. `anonymous` hides reviewer names (applicant view).
 */
export function ReviewSummary({ criteria, reviews, anonymous = false }: { criteria: Criterion[]; reviews: ReviewWithScores[]; anonymous?: boolean }) {
  const done = reviews.filter((r) => r.submittedAt);
  if (!done.length) return <p className="muted text-sm">No completed reviews yet.</p>;
  const label = (i: number, r: ReviewWithScores) => (anonymous ? `Reviewer ${i + 1}` : r.reviewer.name);
  return (
    <div className="space-y-4">
      <div className="-mx-5 overflow-x-auto px-5">
        <table className="data-table min-w-max">
          <thead>
            <tr>
              <th>Criterion</th>
              {done.map((r, i) => <th key={r.id}>{label(i, r)}</th>)}
            </tr>
          </thead>
          <tbody>
            {criteria.map((c) => (
              <tr key={c.id}>
                <td className="max-w-[260px]">{c.title}</td>
                {done.map((r) => {
                  const s = r.scores.find((x) => x.criterionId === c.id);
                  return (
                    <td key={r.id}>
                      {s ? <Pill tone={RATING_LABELS[s.rating].tone}>{RATING_LABELS[s.rating].label}</Pill> : <span className="muted">—</span>}
                      {s?.comment && <p className="muted mt-1 max-w-[220px] text-xs whitespace-pre-wrap">{s.comment}</p>}
                    </td>
                  );
                })}
              </tr>
            ))}
            <tr>
              <td className="font-semibold">Recommendation</td>
              {done.map((r) => (
                <td key={r.id}>{r.recommendation ? <Pill tone={RECOMMENDATION_LABELS[r.recommendation].tone}>{RECOMMENDATION_LABELS[r.recommendation].label}</Pill> : "—"}</td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      {done.some((r) => r.comments) && (
        <div className="space-y-2">
          {done.filter((r) => r.comments).map((r, i) => (
            <div key={r.id} className="rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-800/40">
              <p className="mb-1 text-xs font-semibold">{label(i, r)}</p>
              <p className="whitespace-pre-wrap">{r.comments}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Conversation between the applicant and ICLCA. Internal notes are only shown to staff. */
export async function MessageThread({ applicationId, staff }: { applicationId: string; staff: boolean }) {
  const messages = await db.certMessage.findMany({
    where: { applicationId, ...(staff ? {} : { internal: false }) },
    orderBy: { createdAt: "asc" },
    include: { author: { select: { name: true, avatarUrl: true } } },
  });
  return (
    <Card title="Messages">
      {messages.length === 0 && <p className="muted mb-3 text-sm">No messages yet.</p>}
      <ul className="mb-4 space-y-3">
        {messages.map((m) => (
          <li key={m.id} className={`rounded-lg p-3 text-sm ${m.internal ? "border border-dashed border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30" : "bg-slate-50 dark:bg-slate-800/40"}`}>
            <p className="mb-1 flex items-center gap-2 text-xs">
              <Avatar name={m.author.name} url={m.author.avatarUrl} size={18} />
              <span className="font-semibold">{m.author.name}</span>
              <span className="muted">{timeAgo(m.createdAt)}</span>
              {m.internal && <Pill tone="yellow">Internal</Pill>}
            </p>
            <Markdown>{m.body}</Markdown>
          </li>
        ))}
      </ul>
      <ActionForm action={postCertMessage.bind(null, applicationId)} resetOnSuccess className="space-y-2">
        <textarea name="body" rows={3} placeholder="Write a message…" aria-label="Message" required />
        <div className="flex flex-wrap items-center justify-between gap-2">
          {staff ? (
            <label className="flex items-center gap-2 text-xs font-normal">
              <input type="checkbox" name="internal" /> Internal note (not visible to the applicant)
            </label>
          ) : (
            <span />
          )}
          <SubmitButton className="btn-primary btn-sm">Send</SubmitButton>
        </div>
      </ActionForm>
    </Card>
  );
}
