import { BADGES } from "@/lib/gamification";
import { cn } from "@/lib/utils";

export function BadgeGrid({ earned }: { earned: { key: string; awardedAt: Date }[] }) {
  const byKey = new Map(earned.map((e) => [e.key, e]));
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {BADGES.map((b) => {
        const got = byKey.get(b.key);
        return (
          <div key={b.key} className={cn("rounded-xl border p-3 text-center", got ? "border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30" : "border-slate-200 opacity-50 grayscale dark:border-slate-800")}>
            <div className="text-3xl">{b.icon}</div>
            <p className="mt-1 text-sm font-semibold">{b.name}</p>
            <p className="muted text-xs">{b.description}</p>
          </div>
        );
      })}
    </div>
  );
}
