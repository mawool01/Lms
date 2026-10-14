import Link from "next/link";
import type { LeaderboardRow } from "@/lib/gamification";
import { Avatar, EmptyState } from "@/components/ui";
import { cn } from "@/lib/utils";

const MEDALS = ["🥇", "🥈", "🥉"];

/**
 * Ranked list of learners. `showPoints` is off on course leaderboards, where a
 * visible total would let classmates work out how someone scored on the
 * course's quizzes and assignments; the standing alone is still shown.
 */
export function LeaderboardTable({
  rows,
  currentUserId,
  showPoints = true,
}: {
  rows: LeaderboardRow[];
  currentUserId: string;
  showPoints?: boolean;
}) {
  if (!rows.length) return <EmptyState icon="🏁" title="No points earned yet">Complete lessons and quizzes to get on the board.</EmptyState>;
  return (
    <ol className="divide-y divide-slate-100 dark:divide-slate-800">
      {rows.map((r, i) => (
        <li key={r.userId} className={cn("flex items-center gap-3 px-2 py-3", r.userId === currentUserId && "rounded-lg bg-brand-50 dark:bg-brand-950/50")}>
          <span className="w-8 text-center text-lg font-bold">{MEDALS[i] ?? <span className="muted text-sm">{i + 1}</span>}</span>
          <Avatar name={r.name} url={r.avatarUrl} size={32} />
          <Link href={`/users/${r.userId}`} className="flex-1 truncate font-medium hover:underline">
            {r.name} {r.userId === currentUserId && <span className="muted text-xs">(you)</span>}
          </Link>
          <span className="muted hidden text-xs sm:inline">🏅 {r.badges}</span>
          {showPoints && <span className="w-20 text-right font-bold">{r.points.toLocaleString()} <span className="muted text-xs font-normal">pts</span></span>}
        </li>
      ))}
    </ol>
  );
}
