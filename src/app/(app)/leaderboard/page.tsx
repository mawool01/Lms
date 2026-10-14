import { requireUser } from "@/lib/auth";
import { leaderboard, levelFor, POINTS, totalPoints } from "@/lib/gamification";
import { LeaderboardTable } from "@/components/leaderboard-table";
import { Card, PageHeader } from "@/components/ui";

export const metadata = { title: "Leaderboard" };

export default async function LeaderboardPage() {
  const user = await requireUser();
  const [rows, points] = await Promise.all([leaderboard({ limit: 100 }), totalPoints(user.id)]);
  const rank = rows.findIndex((r) => r.userId === user.id);
  const level = levelFor(points);

  return (
    <>
      <PageHeader title="Leaderboard" subtitle="Earn points by learning, participating and excelling." />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2" title="ICLCA top learners">
          <LeaderboardTable rows={rows} currentUserId={user.id} />
        </Card>
        <div className="space-y-6">
          {user.role === "STUDENT" && (
            <Card title="Your standing">
              <p className="text-3xl font-bold">{rank >= 0 ? `#${rank + 1}` : "—"}</p>
              <p className="muted text-sm">{points.toLocaleString()} points · Level {level.level} {level.name}</p>
              {!user.showOnLeaderboard && <p className="muted mt-2 text-xs">You&apos;re hidden from leaderboards (change in Profile).</p>}
            </Card>
          )}
          <Card title="How to earn points">
            <ul className="space-y-2 text-sm">
              <li className="flex justify-between"><span>📘 Complete a lesson</span><span className="font-semibold">+10*</span></li>
              <li className="flex justify-between"><span>📝 Pass a quiz</span><span className="font-semibold">+{POINTS.quizPass}</span></li>
              <li className="flex justify-between"><span>💯 Perfect quiz score</span><span className="font-semibold">+{POINTS.quizPerfect}</span></li>
              <li className="flex justify-between"><span>📄 Submit an assignment</span><span className="font-semibold">+{POINTS.assignmentSubmit}</span></li>
              <li className="flex justify-between"><span>🌟 Score 90%+ on an assignment</span><span className="font-semibold">+{POINTS.assignmentExcellent}</span></li>
              <li className="flex justify-between"><span>🎓 Finish all lessons in a course</span><span className="font-semibold">+{POINTS.courseComplete}</span></li>
              <li className="flex justify-between"><span>💬 Start a discussion</span><span className="font-semibold">+{POINTS.forumThread}</span></li>
              <li className="flex justify-between"><span>↩️ Reply in a forum</span><span className="font-semibold">+{POINTS.forumReply}</span></li>
            </ul>
            <p className="muted mt-3 text-xs">*Teachers can set custom points per lesson.</p>
          </Card>
        </div>
      </div>
    </>
  );
}
