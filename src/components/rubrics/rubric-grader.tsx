"use client";

import { useState } from "react";
import type { RubricData, RubricSelection } from "@/lib/rubrics";
import { criterionMax, rubricMax, scaleScore, sortedLevels } from "@/lib/rubrics";
import { cn } from "@/lib/utils";

/**
 * Click-to-score rubric. Submits `rubricScores` (JSON) and a score field (`scoreName`) that is auto-filled
 * from the rubric total scaled to `outOf`; the teacher can still type a different score.
 */
export function RubricGrader({
  rubric,
  outOf,
  scoreName,
  initialScore,
  initialSelections,
  scoreLabel = "Grade",
  rubricField = "rubricScores",
}: {
  rubric: RubricData;
  outOf: number;
  scoreName: string;
  initialScore: number | null;
  initialSelections?: Record<string, RubricSelection> | null;
  scoreLabel?: string;
  rubricField?: string;
}) {
  const [sel, setSel] = useState<Record<string, { levelId: string | null; comment: string }>>(() =>
    Object.fromEntries(rubric.criteria.map((c) => [c.id, { levelId: initialSelections?.[c.id]?.levelId ?? null, comment: initialSelections?.[c.id]?.comment ?? "" }])),
  );
  const max = rubricMax(rubric.criteria);
  const total = rubric.criteria.reduce((s, c) => s + (c.levels.find((l) => l.id === sel[c.id]?.levelId)?.points ?? 0), 0);
  const scaled = scaleScore(total, max, outOf);
  const anySelected = Object.values(sel).some((s) => s.levelId);
  const [score, setScore] = useState<string>(initialScore != null ? String(initialScore) : "");
  // Until the teacher types a score, it follows the rubric.
  const [overridden, setOverridden] = useState(initialScore != null && (!initialSelections || initialScore !== scaled));
  const shown = overridden ? score : anySelected ? String(scaled) : score;

  const pick = (criterionId: string, levelId: string) => setSel((s) => ({ ...s, [criterionId]: { ...s[criterionId], levelId: s[criterionId].levelId === levelId ? null : levelId } }));

  return (
    <div className="space-y-3" data-testid="rubric-grader">
      <input type="hidden" name={rubricField} value={JSON.stringify(sel)} />
      <div className="-mx-1 overflow-x-auto px-1">
        <table className="w-full min-w-[560px] border-collapse text-sm">
          <tbody>
            {rubric.criteria.map((c) => {
              const chosen = sel[c.id]?.levelId;
              const pts = c.levels.find((l) => l.id === chosen)?.points;
              return (
                <tr key={c.id} className="border-t border-slate-200 align-top dark:border-slate-700">
                  <th scope="row" className="w-44 py-2 pr-3 text-left font-medium">
                    {c.title}
                    <span className="muted block text-xs font-normal">{pts ?? "–"} / {criterionMax(c)}</span>
                  </th>
                  {sortedLevels(c).map((l) => (
                    <td key={l.id} className="p-1">
                      <button
                        type="button"
                        onClick={() => pick(c.id, l.id)}
                        aria-pressed={chosen === l.id}
                        aria-label={`${c.title}: ${l.label} (${l.points})`}
                        className={cn(
                          "h-full w-full rounded-lg border p-2 text-left transition",
                          chosen === l.id ? "border-brand-500 bg-brand-50 ring-2 ring-brand-500/30 dark:bg-brand-950/50" : "border-slate-200 hover:border-brand-300 dark:border-slate-700",
                        )}
                      >
                        <span className="block text-xs font-semibold">{l.label} · {l.points}</span>
                        {l.description && <span className="muted mt-0.5 block text-xs">{l.description}</span>}
                      </button>
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <details className="text-sm">
        <summary className="link cursor-pointer text-xs">Comments per criterion</summary>
        <div className="mt-2 space-y-2">
          {rubric.criteria.map((c) => (
            <input
              key={c.id}
              value={sel[c.id]?.comment ?? ""}
              onChange={(e) => setSel((s) => ({ ...s, [c.id]: { ...s[c.id], comment: e.target.value } }))}
              placeholder={`Comment on ${c.title}`}
              aria-label={`Comment on ${c.title}`}
            />
          ))}
        </div>
      </details>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span>Rubric total <strong data-testid="rubric-total">{total}</strong> / {max} → <strong>{anySelected ? scaled : "–"}</strong> / {outOf}</span>
        <label className="flex items-center gap-2 font-normal">
          {scoreLabel}
          <input
            name={scoreName}
            type="number"
            min={0}
            max={outOf}
            className="w-24"
            value={shown}
            onChange={(e) => {
              setScore(e.target.value);
              setOverridden(true);
            }}
            aria-label={scoreLabel}
          />
          <span className="muted">/ {outOf}</span>
        </label>
        {overridden && anySelected && Number(score) !== scaled && (
          <button type="button" className="link text-xs" onClick={() => setOverridden(false)}>Use rubric score</button>
        )}
      </div>
    </div>
  );
}
