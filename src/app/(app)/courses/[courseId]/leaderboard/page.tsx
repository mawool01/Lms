import { requireUser } from "@/lib/auth";
import { canSeePoints, requireCourseMember } from "@/lib/permissions";
import { leaderboard } from "@/lib/gamification";
import { LeaderboardTable } from "@/components/leaderboard-table";
import { Card } from "@/components/ui";

export default async function CourseLeaderboardPage({ params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await params;
  const user = await requireUser();
  await requireCourseMember(user, courseId);
  const rows = await leaderboard({ courseId });
  // Students see standings only — a visible total would tell them how a
  // classmate scored. Teachers and admins see the figures.
  const showPoints = canSeePoints(user);
  return (
    <Card title="Course leaderboard" action={<span className="muted text-xs">Ranked by points earned in this course</span>}>
      <LeaderboardTable rows={rows} currentUserId={user.id} showPoints={showPoints} />
    </Card>
  );
}
