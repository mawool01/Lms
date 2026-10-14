import Link from "next/link";
import { getBranding } from "@/lib/branding";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { blobClientConfig } from "@/lib/blob";
import { completedCourses, ensurePortfolioSlug, portfolioUrl } from "@/lib/portfolio";
import { ITEM_TYPES, ITEM_TYPE_ORDER, VISIBILITY_LABELS, itemDates } from "@/lib/portfolio-meta";
import {
  deletePortfolioItem,
  movePortfolioItem,
  requestVerification,
  savePortfolioSettings,
  savePortfolioItem,
  togglePortfolioItem,
} from "@/lib/actions/portfolio";
import { ActionForm, SubmitButton } from "@/components/forms";
import { PortfolioItemForm } from "@/components/portfolio/item-form";
import { CopyLink } from "@/components/portfolio/copy-link";
import { Card, PageHeader, Pill } from "@/components/ui";

export const metadata = { title: "My portfolio" };

const verificationPills = (org: string) =>
  ({
    NONE: null,
    REQUESTED: <Pill tone="yellow">Verification requested</Pill>,
    VERIFIED: <Pill tone="green">✓ Verified by {org}</Pill>,
    DECLINED: <Pill tone="red">Not verified</Pill>,
  }) as const;

export default async function MyPortfolioPage() {
  const user = await requireUser();
  const slug = await ensurePortfolioSlug(user);
  const org = (await getBranding()).shortName;
  const VERIFICATION_PILLS = verificationPills(org);
  const [items, certCount, courses] = await Promise.all([
    db.portfolioItem.findMany({ where: { userId: user.id }, orderBy: [{ position: "asc" }, { startDate: "desc" }] }),
    db.certification.count({ where: { holderId: user.id, revokedAt: null } }),
    completedCourses(user.id),
  ]);
  const blob = blobClientConfig();
  const toValues = (i: (typeof items)[number]) => ({ ...i, startDate: i.startDate?.toISOString() ?? null, endDate: i.endDate?.toISOString() ?? null });

  return (
    <>
      <PageHeader
        title="My portfolio"
        subtitle={`Showcase your work and ${org} achievements at your own link — a living transcript you can share with employers and colleagues.`}
        actions={
          <>
            <Link href={`/p/${slug}`} className="btn-primary">👁 View portfolio</Link>
            <a href={`/p/${slug}/transcript.pdf`} className="btn-secondary">⬇ Transcript PDF</a>
          </>
        }
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {ITEM_TYPE_ORDER.map((type) => {
            const meta = ITEM_TYPES[type];
            const list = items.filter((i) => i.type === type);
            return (
              <Card key={type} title={`${meta.icon} ${meta.label}`}>
                {list.length > 0 && (
                  <ul className="mb-4 space-y-2">
                    {list.map((item, idx) => (
                      <li key={item.id} className={`rounded-xl border border-slate-200 dark:border-slate-800 ${item.visible ? "" : "opacity-60"}`}>
                        <details>
                          <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 p-3">
                            <div className="min-w-0 flex-1">
                              <p className="font-medium">{item.title}</p>
                              <p className="muted text-xs">{[item.role, item.organization, itemDates(item, meta.dates), item.hours ? `${item.hours} h` : null].filter(Boolean).join(" · ")}</p>
                            </div>
                            {!item.visible && <Pill>Hidden</Pill>}
                            {VERIFICATION_PILLS[item.verification]}
                            <span className="muted text-xs">Edit ▾</span>
                          </summary>
                          <div className="space-y-3 border-t border-slate-100 p-3 dark:border-slate-800">
                            {item.verification === "DECLINED" && item.verificationNote && <p className="rounded-lg bg-red-50 p-2 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-300">{org}: {item.verificationNote}</p>}
                            <PortfolioItemForm type={type} action={savePortfolioItem.bind(null, item.id)} values={toValues(item)} blob={blob} userId={user.id} />
                            <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                              <form action={movePortfolioItem.bind(null, item.id, -1)}><button className="btn-ghost btn-sm" disabled={idx === 0}>↑ Up</button></form>
                              <form action={movePortfolioItem.bind(null, item.id, 1)}><button className="btn-ghost btn-sm" disabled={idx === list.length - 1}>↓ Down</button></form>
                              <form action={togglePortfolioItem.bind(null, item.id)}><button className="btn-ghost btn-sm">{item.visible ? "Hide from portfolio" : "Show on portfolio"}</button></form>
                              {(item.verification === "NONE" || item.verification === "DECLINED") && (
                                <form action={requestVerification.bind(null, item.id)}><button className="btn-ghost btn-sm">Request {org} verification</button></form>
                              )}
                              <form action={deletePortfolioItem.bind(null, item.id)}><button className="btn-ghost btn-sm text-red-600">Delete</button></form>
                            </div>
                          </div>
                        </details>
                      </li>
                    ))}
                  </ul>
                )}
                <details className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700" open={list.length === 0 && (type === "POSITION" || type === "PRESENTATION")}>
                  <summary className="cursor-pointer list-none p-3 text-sm font-medium text-brand-700 dark:text-brand-300">+ Add {meta.singular.toLowerCase()}</summary>
                  <div className="p-3 pt-0"><PortfolioItemForm type={type} action={savePortfolioItem.bind(null, null)} blob={blob} userId={user.id} /></div>
                </details>
              </Card>
            );
          })}
        </div>

        <div className="space-y-6">
          <Card title="Your link">
            <CopyLink url={portfolioUrl(slug)} />
            <p className="muted mt-2 text-xs">{VISIBILITY_LABELS[user.portfolioVisibility].label}: {VISIBILITY_LABELS[user.portfolioVisibility].description}</p>
          </Card>
          <Card title="Settings">
            <ActionForm action={savePortfolioSettings} className="space-y-4">
              <div className="field">
                <label htmlFor="slug">Address</label>
                <div className="flex items-center gap-1 text-sm"><span className="muted shrink-0">/p/</span><input id="slug" name="slug" defaultValue={slug} required pattern="[a-z0-9][a-z0-9-]{1,38}[a-z0-9]" /></div>
              </div>
              <fieldset className="space-y-2">
                <legend className="mb-1 text-sm font-medium">Who can see it</legend>
                {(Object.keys(VISIBILITY_LABELS) as (keyof typeof VISIBILITY_LABELS)[]).map((v) => (
                  <label key={v} className="flex gap-2 font-normal">
                    <input type="radio" name="visibility" value={v} defaultChecked={user.portfolioVisibility === v} className="mt-0.5" />
                    <span><span className="font-medium">{VISIBILITY_LABELS[v].label}</span><span className="muted block text-xs">{VISIBILITY_LABELS[v].description}</span></span>
                  </label>
                ))}
              </fieldset>
              <div className="field">
                <label htmlFor="headline">Headline</label>
                <input id="headline" name="headline" maxLength={160} defaultValue={user.portfolioHeadline ?? ""} placeholder="e.g. Learning center director & tutor trainer" />
              </div>
              <div className="field">
                <label htmlFor="summary">About <span className="muted font-normal">(Markdown)</span></label>
                <textarea id="summary" name="summary" rows={4} defaultValue={user.portfolioSummary ?? ""} />
              </div>
              <fieldset className="space-y-1">
                <legend className="mb-1 text-sm font-medium">Include automatically</legend>
                <label className="flex items-center gap-2 font-normal"><input type="checkbox" name="showCertifications" defaultChecked={user.portfolioShowCertifications} /> {org} certifications ({certCount})</label>
                <label className="flex items-center gap-2 font-normal"><input type="checkbox" name="showCourses" defaultChecked={user.portfolioShowCourses} /> Completed courses ({courses.length})</label>
                <label className="flex items-center gap-2 font-normal"><input type="checkbox" name="showBadges" defaultChecked={user.portfolioShowBadges} /> Badges &amp; points</label>
                <p className="muted text-xs">These come from {org} records and are shown as verified. Course grades are never shown.</p>
              </fieldset>
              <SubmitButton>Save settings</SubmitButton>
            </ActionForm>
          </Card>
        </div>
      </div>
    </>
  );
}
