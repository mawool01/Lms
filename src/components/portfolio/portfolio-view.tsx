import Link from "next/link";
import type { Portfolio } from "@/lib/portfolio";
import { ITEM_TYPES, ITEM_TYPE_ORDER, itemDates, volumeIssue } from "@/lib/portfolio-meta";
import { certState, CERT_STATE_LABELS, evidenceName } from "@/lib/certifications/status";
import { formatDate } from "@/lib/utils";
import { Markdown } from "@/components/markdown";
import { Avatar, Pill } from "@/components/ui";

function VerifiedMark({ verified, org }: { verified: boolean; org: string }) {
  return verified ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300" title={`Confirmed by ${org}`}>
      ✓ Verified by {org}
    </span>
  ) : (
    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500 dark:bg-slate-800 dark:text-slate-400" title="Added by the portfolio owner">
      Self-reported
    </span>
  );
}

function Section({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <section className="break-inside-avoid-page">
      <h2 className="mb-3 flex items-center gap-2 border-b border-slate-200 pb-2 text-lg font-bold dark:border-slate-800">
        <span aria-hidden>{icon}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

/** Full portfolio, as visitors see it. */
export function PortfolioView({ p, org }: { p: Portfolio; org: string }) {
  const { user } = p;
  const pdHours = p.byType.PROFESSIONAL_DEVELOPMENT.reduce((s, i) => s + (i.hours ?? 0), 0);

  return (
    <article className="space-y-8">
      <header className="flex flex-col items-center gap-4 text-center sm:flex-row sm:items-start sm:text-left">
        <Avatar name={user.name} url={user.avatarUrl} size={96} />
        <div className="min-w-0 flex-1">
          <h1 className="text-3xl font-bold">{user.name}</h1>
          {user.portfolioHeadline && <p className="mt-1 text-lg text-slate-600 dark:text-slate-300">{user.portfolioHeadline}</p>}
          <p className="muted mt-1">{[user.jobTitle, user.institution].filter(Boolean).join(" · ")}</p>
          <div className="mt-2 flex flex-wrap justify-center gap-2 sm:justify-start">
            {user.waIsMember && user.waMembershipLevel && (
              <Pill tone={user.waMembershipStatus === "Active" ? "green" : "gray"}>{org} member · {user.waMembershipLevel}</Pill>
            )}
            {p.certifications.filter((c) => ["active", "expiring"].includes(certState(c))).map((c) => (
              <Pill key={c.id} tone="brand">🎖️ {c.level.name}</Pill>
            ))}
          </div>
        </div>
      </header>

      {user.portfolioSummary && (
        <section className="prose-lms">
          <Markdown>{user.portfolioSummary}</Markdown>
        </section>
      )}

      {p.certifications.length > 0 && (
        <Section title={`${org} certifications`} icon="🎖️">
          <ul className="space-y-3">
            {p.certifications.map((c) => {
              const state = certState(c);
              return (
                <li key={c.id} className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="font-semibold">{c.program.name} — {c.level.name}</p>
                    {c.centerName && <p className="text-sm">{c.centerName}{c.institution && `, ${c.institution}`}</p>}
                    <p className="muted text-xs">
                      Issued {formatDate(c.issuedAt)} · {c.expiresAt ? `${state === "expired" ? "Expired" : "Valid until"} ${formatDate(c.expiresAt)}` : "Lifetime"} ·{" "}
                      <Link href={`/verify/${c.code}`} className="link font-mono">{c.code}</Link>
                    </p>
                  </div>
                  <span className="flex gap-1">
                    <Pill tone={CERT_STATE_LABELS[state].tone}>{CERT_STATE_LABELS[state].label}</Pill>
                    <VerifiedMark verified org={org} />
                  </span>
                </li>
              );
            })}
          </ul>
        </Section>
      )}

      {ITEM_TYPE_ORDER.map((type) => {
        const items = p.byType[type];
        if (!items.length) return null;
        const meta = ITEM_TYPES[type];
        return (
          <Section key={type} title={type === "PROFESSIONAL_DEVELOPMENT" && pdHours ? `${meta.label} · ${pdHours} hours` : meta.label} icon={meta.icon}>
            <ul className="space-y-5">
              {items.map((item) => (
                <li key={item.id}>
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <p className="font-semibold">
                        {item.url ? <a href={item.url} target="_blank" rel="noopener noreferrer" className="hover:underline">{item.title}</a> : item.title}
                      </p>
                      <p className="text-sm text-slate-600 dark:text-slate-300">
                        {[item.role, item.organization, volumeIssue(item), item.location].filter(Boolean).join(" · ")}
                      </p>
                      <p className="muted text-xs">
                        {[itemDates(item, meta.dates), item.hours ? `${item.hours} hours` : null, item.collaborators ? `with ${item.collaborators}` : null].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    <VerifiedMark verified={item.verification === "VERIFIED"} org={org} />
                  </div>
                  {item.description && <div className="mt-1 text-sm"><Markdown>{item.description}</Markdown></div>}
                  {item.files.length > 0 && (
                    <ul className="mt-1 flex flex-wrap gap-2">
                      {item.files.map((f) => (
                        <li key={f}>
                          <a href={f} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800">
                            📎 {evidenceName(f)}
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          </Section>
        );
      })}

      {p.courses.length > 0 && (
        <Section title={`${org} courses completed`} icon="📘">
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {p.courses.map((c) => (
              <li key={c.id} className="flex flex-col gap-1 py-2 sm:flex-row sm:items-center sm:justify-between">
                <span><span className="font-medium">{c.title}</span> <span className="muted text-xs">{c.code}</span></span>
                <span className="flex items-center gap-2"><span className="muted text-xs">Completed {formatDate(c.completedAt)}</span><VerifiedMark verified org={org} /></span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {((user.portfolioShowBadges && p.badges.length > 0) || (user.portfolioShowPoints && p.points > 0)) && (
        <Section title="Learning achievements" icon="🏆">
          {user.portfolioShowPoints && p.points > 0 && (
            <p className="mb-3 text-sm">
              <span className="font-semibold">{p.points.toLocaleString()} points</span> · Level {p.level.level} ({p.level.name})
            </p>
          )}
          {user.portfolioShowBadges && p.badges.length > 0 && (
            <ul className="flex flex-wrap gap-2">
              {p.badges.map((b) => (
                <li key={b.id} title={b.badge.description} className="flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-sm dark:border-amber-800 dark:bg-amber-950/30">
                  <span>{b.badge.icon}</span>
                  {b.badge.name}
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}
    </article>
  );
}
