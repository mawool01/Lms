import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { canSeePoints } from "@/lib/permissions";
import { levelFor, totalPoints } from "@/lib/gamification";
import { messageableUsers } from "@/lib/conversations";
import { startConversation } from "@/lib/actions/community";
import { BadgeGrid } from "@/components/badge-grid";
import { CourseCard } from "@/components/course/course-card";
import { Avatar, Card, RolePill, Stat } from "@/components/ui";

export default async function UserPage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  const viewer = await requireUser();
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, role: true, bio: true, avatarUrl: true, createdAt: true, active: true, portfolioSlug: true, portfolioVisibility: true, badges: { include: { badge: true } } },
  });
  if (!user || !user.active) notFound();
  const isSelf = viewer.id === user.id;
  // Classmates mustn't see each other's points; teachers, admins and the learner
  // do. Don't even load the total when it won't be shown.
  const showPoints = canSeePoints(viewer, user.id);
  const [points, taught, canMessage] = await Promise.all([
    showPoints ? totalPoints(user.id) : Promise.resolve(0),
    user.role !== "STUDENT"
      ? db.course.findMany({ where: { teacherId: user.id, published: true }, include: { teacher: { select: { name: true } } } })
      : Promise.resolve([]),
    !isSelf && messageableUsers(viewer).then((list) => list.some((u) => u.id === user.id)),
  ]);
  const level = levelFor(points);

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:text-left">
          <Avatar name={user.name} url={user.avatarUrl} size={88} />
          <div className="flex-1">
            <h1 className="text-2xl font-bold">{user.name}</h1>
            <div className="mt-1"><RolePill role={user.role} /></div>
            {user.bio && <p className="mt-2 max-w-xl whitespace-pre-wrap">{user.bio}</p>}
            <p className="muted mt-2 text-xs">Member since {user.createdAt.toLocaleDateString("en-US", { month: "long", year: "numeric" })}</p>
          </div>
          {user.portfolioSlug && (user.portfolioVisibility !== "PRIVATE" || viewer.id === user.id || viewer.role === "ADMIN") && (
            <Link href={`/p/${user.portfolioSlug}`} className="btn-secondary">🗂️ Portfolio</Link>
          )}
          {canMessage && (
            <form action={startConversation.bind(null, user.id)}><button className="btn-primary">💬 Message</button></form>
          )}
        </div>
      </Card>
      {user.role === "STUDENT" && (
        <>
          {showPoints && (
            <div className="grid grid-cols-3 gap-3">
              <Stat label="Points" value={points.toLocaleString()} icon="⭐" />
              <Stat label="Level" value={level.level} hint={level.name} icon="🚀" />
              <Stat label="Badges" value={user.badges.length} icon="🏅" />
              {!isSelf && <p className="muted col-span-3 text-xs">Points and level are visible to you as staff — students don&apos;t see each other&apos;s.</p>}
            </div>
          )}
          <Card title="Badges" action={showPoints ? undefined : <span className="muted text-xs">🏅 {user.badges.length}</span>}>
            <BadgeGrid earned={user.badges.map((b) => ({ key: b.badge.key, awardedAt: b.awardedAt }))} />
          </Card>
        </>
      )}
      {taught.length > 0 && (
        <Card title="Courses taught">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {taught.map((c) => <CourseCard key={c.id} course={c} />)}
          </div>
        </Card>
      )}
    </div>
  );
}
