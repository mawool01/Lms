import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { toggleReviewer } from "@/lib/actions/certifications";
import { Avatar, Card, Pill, RolePill } from "@/components/ui";

export default async function ReviewersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireRole("ADMIN");
  const { q = "" } = await searchParams;
  const [reviewers, others] = await Promise.all([
    db.user.findMany({
      where: { certReviewer: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true, role: true, avatarUrl: true, active: true, _count: { select: { certReviews: { where: { submittedAt: null } } } } },
    }),
    q
      ? db.user.findMany({
          where: { certReviewer: false, active: true, OR: [{ name: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }] },
          orderBy: { name: "asc" },
          take: 20,
          select: { id: true, name: true, email: true, role: true, avatarUrl: true },
        })
      : Promise.resolve([]),
  ]);
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card title={`Review committee pool (${reviewers.length})`}>
        <p className="muted mb-3 text-sm">People here can be assigned to review applications (e.g. Past Presidents&apos; Council, Executive Board, prior LCE recipients). They don&apos;t need admin access.</p>
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {reviewers.map((u) => (
            <li key={u.id} className="flex items-center gap-3 py-2.5">
              <Avatar name={u.name} url={u.avatarUrl} size={28} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{u.name} {!u.active && <Pill tone="red">Deactivated</Pill>}</p>
                <p className="muted truncate text-xs">{u.email} · {u._count.certReviews} pending</p>
              </div>
              <form action={toggleReviewer.bind(null, u.id)}><button className="muted text-xs hover:text-red-600">Remove</button></form>
            </li>
          ))}
          {reviewers.length === 0 && <li className="muted py-3 text-sm">No reviewers yet.</li>}
        </ul>
      </Card>
      <Card title="Add reviewers">
        <form className="mb-3 flex gap-2">
          <input name="q" defaultValue={q} placeholder="Search people by name or email" />
          <button className="btn-secondary">Search</button>
        </form>
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {others.map((u) => (
            <li key={u.id} className="flex items-center gap-3 py-2.5">
              <Avatar name={u.name} url={u.avatarUrl} size={28} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{u.name} <RolePill role={u.role} /></p>
                <p className="muted truncate text-xs">{u.email}</p>
              </div>
              <form action={toggleReviewer.bind(null, u.id)}><button className="btn-primary btn-sm">Add</button></form>
            </li>
          ))}
          {q && others.length === 0 && <li className="muted py-3 text-sm">No one found. Reviewers need an account first (Admin → Add a user).</li>}
        </ul>
      </Card>
    </div>
  );
}
