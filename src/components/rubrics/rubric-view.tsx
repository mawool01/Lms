import type { RubricData, RubricSelection } from "@/lib/rubrics";
import { criterionMax, rubricMax, sortedLevels } from "@/lib/rubrics";
import { cn } from "@/lib/utils";

/**
 * Read-only rubric grid. With `selections`, highlights the chosen level per criterion and shows comments
 * (the scored rubric a learner sees with their grade).
 */
export function RubricView({ rubric, selections, compact = false }: { rubric: RubricData; selections?: Record<string, RubricSelection>; compact?: boolean }) {
  const max = rubricMax(rubric.criteria);
  const total = selections ? rubric.criteria.reduce((s, c) => s + (selections[c.id]?.points ?? 0), 0) : null;
  return (
    <div className="space-y-2" data-testid="rubric-view">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-semibold">📏 {rubric.title}</p>
        <p className="muted text-xs">{total !== null ? <><span className="font-semibold text-slate-900 dark:text-slate-100">{total}</span> / {max} rubric points</> : `${max} rubric points`}</p>
      </div>
      {rubric.description && !compact && <p className="muted text-sm whitespace-pre-wrap">{rubric.description}</p>}
      <div className="-mx-1 overflow-x-auto px-1">
        <table className="w-full min-w-[560px] border-collapse text-sm">
          <tbody>
            {rubric.criteria.map((c) => {
              const sel = selections?.[c.id];
              return (
                <tr key={c.id} className="border-t border-slate-200 align-top dark:border-slate-700">
                  <th scope="row" className="w-48 py-2 pr-3 text-left font-medium">
                    {c.title}
                    <span className="muted block text-xs font-normal">{sel ? `${sel.points} / ${criterionMax(c)}` : `${criterionMax(c)} pts`}</span>
                    {c.description && !compact && <span className="muted block text-xs font-normal whitespace-pre-wrap">{c.description}</span>}
                  </th>
                  {sortedLevels(c).map((l) => {
                    const chosen = sel?.levelId === l.id;
                    return (
                      <td key={l.id} className="p-1">
                        <div
                          className={cn(
                            "h-full rounded-lg border p-2",
                            chosen ? "border-brand-500 bg-brand-50 ring-2 ring-brand-500/30 dark:bg-brand-950/50" : "border-slate-200 dark:border-slate-700",
                            selections && !chosen && "opacity-60",
                          )}
                          aria-current={chosen || undefined}
                        >
                          <p className="text-xs font-semibold">{l.label} · {l.points}</p>
                          {l.description && <p className="muted mt-0.5 text-xs whitespace-pre-wrap">{l.description}</p>}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {selections && rubric.criteria.some((c) => selections[c.id]?.comment) && (
        <ul className="space-y-1 text-sm">
          {rubric.criteria.filter((c) => selections[c.id]?.comment).map((c) => (
            <li key={c.id} className="rounded-lg bg-slate-50 p-2 dark:bg-slate-800/50">
              <span className="font-semibold">{c.title}: </span>
              <span className="whitespace-pre-wrap">{selections[c.id].comment}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
