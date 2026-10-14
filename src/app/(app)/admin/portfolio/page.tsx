import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { decideVerification } from "@/lib/actions/portfolio";
import { ITEM_TYPES, itemDates } from "@/lib/portfolio-meta";
import { evidenceName } from "@/lib/certifications/status";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Markdown } from "@/components/markdown";
import { Avatar, Card, EmptyState, PageHeader, Pill } from "@/components/ui";
import { timeAgo } from "@/lib/utils";

export const metadata = { title: "Portfolio verification" };

export default async function PortfolioAdminPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireRole("ADMIN");
  const { q = "" } = await searchParams;
  const [requests, recent, people] = await Promise.all([
    db.portfolioItem.findMany({
      where: { verification: "REQUESTED" },
      include: { user: { select: { name: true, email: true, avatarUrl: true, portfolioSlug: true, institution: true } } },
      orderBy: { updatedAt: "asc" },
    }),
    db.portfolioItem.findMany({
      where: { verification: { in: ["VERIFIED", "DECLINED"] } },
      include: { user: { select: { name: true, portfolioSlug: true } }, verifiedBy: { select: { name: true } } },
      orderBy: { verifiedAt: "desc" },
      take: 15,
    }),
    q
      ? db.user.findMany({
          where: { OR: [{ name: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }] },
          select: { id: true, name: true, email: true, portfolioSlug: true, portfolioVisibility: true, _count: { select: { portfolioItems: true } } },
          take: 20,
          orderBy: { name: "asc" },
        })
      : Promise.resolve([]),
  ]);

  return (
    <>
      <PageHeader title="Portfolio verification" subtitle="Confirm presentations, service and other items members add to their portfolios." actions={<Link href="/admin" className="btn-secondary">← Admin</Link>} />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <h2 className="text-lg font-semibold">Requests ({requests.length})</h2>
          {requests.length === 0 && <EmptyState icon="✅" title="No verification requests" />}
          {requests.map((item) => {
            const meta = ITEM_TYPES[item.type];
            return (
              <Card key={item.id}>
                <div className="mb-2 flex items-center gap-2 text-sm">
                  <Avatar name={item.user.name} url={item.user.avatarUrl} size={24} />
                  <span className="font-medium">{item.user.name}</span>
                  <span className="muted text-xs">{item.user.email} · requested {timeAgo(item.updatedAt)}</span>
                  {item.user.portfolioSlug && <Link href={`/p/${item.user.portfolioSlug}`} className="link ml-auto text-xs">Portfolio</Link>}
                </div>
                <Pill>{meta.icon} {meta.singular}</Pill>
                <p className="mt-2 font-semibold">{item.title}</p>
                <p className="muted text-sm">{[item.role, item.organization, item.location, itemDates(item, meta.dates), item.hours ? `${item.hours} hours` : null, item.collaborators ? `with ${item.collaborators}` : null].filter(Boolean).join(" · ")}</p>
                {item.description && <div className="mt-2 text-sm"><Markdown>{item.description}</Markdown></div>}
                <ul className="mt-2 space-y-1 text-sm">
                  {item.url && <li>🔗 <a href={item.url} target="_blank" rel="noopener noreferrer" className="link break-all">{item.url}</a></li>}
                  {item.files.map((f) => <li key={f}>📎 <a href={f} target="_blank" rel="noopener noreferrer" className="link">{evidenceName(f)}</a></li>)}
                </ul>
                <ActionForm action={decideVerification.bind(null, item.id)} className="mt-4 space-y-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                  <div className="flex flex-wrap gap-3 text-sm">
                    <label className="flex items-center gap-2 font-normal"><input type="radio" name="decision" value="VERIFIED" required /> ✅ Verify</label>
                    <label className="flex items-center gap-2 font-normal"><input type="radio" name="decision" value="DECLINED" /> ✖ Can&apos;t verify</label>
                  </div>
                  <input name="note" placeholder="Note to the member (required if you can't verify)" aria-label="Note" />
                  <SubmitButton className="btn-primary btn-sm">Save</SubmitButton>
                </ActionForm>
              </Card>
            );
          })}
        </div>
        <div className="space-y-6">
          <Card title="Find a portfolio">
            <form className="mb-3 flex gap-2">
              <input name="q" defaultValue={q} placeholder="Name or email" />
              <button className="btn-secondary">Search</button>
            </form>
            <ul className="space-y-2 text-sm">
              {people.map((u) => (
                <li key={u.id} className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate">{u.name} <span className="muted text-xs">({u._count.portfolioItems} items)</span></span>
                  {u.portfolioSlug ? <Link href={`/p/${u.portfolioSlug}`} className="link shrink-0">/p/{u.portfolioSlug}</Link> : <span className="muted text-xs">not set up</span>}
                </li>
              ))}
            </ul>
          </Card>
          <Card title="Recent decisions">
            {recent.length === 0 ? <p className="muted text-sm">None yet.</p> : (
              <ul className="space-y-2 text-sm">
                {recent.map((i) => (
                  <li key={i.id}>
                    <Pill tone={i.verification === "VERIFIED" ? "green" : "red"}>{i.verification === "VERIFIED" ? "Verified" : "Declined"}</Pill>{" "}
                    {i.title} <span className="muted text-xs">— {i.user.name}{i.verifiedBy && `, by ${i.verifiedBy.name}`}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
