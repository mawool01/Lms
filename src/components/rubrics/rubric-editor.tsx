"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveRubric, type RubricDraft } from "@/lib/actions/rubrics";
import { blankCriterion, criterionMax, newId, rubricMax, type RubricCriterion, type RubricLevel } from "@/lib/rubrics";

export function RubricEditor({ rubricId, initial }: { rubricId: string; initial: RubricDraft }) {
  const router = useRouter();
  const [draft, setDraft] = useState<RubricDraft>(initial);
  const [message, setMessage] = useState<{ error?: string; ok?: string }>();
  const [dirty, setDirty] = useState(false);
  const [pending, start] = useTransition();

  const set = (patch: Partial<RubricDraft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setDirty(true);
    setMessage(undefined);
  };
  const setCriteria = (fn: (c: RubricCriterion[]) => RubricCriterion[]) => set({ criteria: fn(draft.criteria) });
  const updateCriterion = (id: string, patch: Partial<RubricCriterion>) => setCriteria((cs) => cs.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  const updateLevel = (cid: string, lid: string, patch: Partial<RubricLevel>) =>
    setCriteria((cs) => cs.map((c) => (c.id === cid ? { ...c, levels: c.levels.map((l) => (l.id === lid ? { ...l, ...patch } : l)) } : c)));
  const move = (i: number, dir: -1 | 1) =>
    setCriteria((cs) => {
      const j = i + dir;
      if (j < 0 || j >= cs.length) return cs;
      const next = [...cs];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  const save = () =>
    start(async () => {
      const result = await saveRubric(rubricId, draft);
      setMessage(result);
      if (!result?.error) {
        setDirty(false);
        router.refresh();
      }
    });

  return (
    <div className="space-y-4">
      <div className="card space-y-3 p-5">
        <div className="field">
          <label htmlFor="r-title">Rubric title</label>
          <input id="r-title" value={draft.title} onChange={(e) => set({ title: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="r-desc">Description <span className="muted font-normal">(optional, shown to learners)</span></label>
          <textarea id="r-desc" rows={2} value={draft.description} onChange={(e) => set({ description: e.target.value })} />
        </div>
      </div>

      {draft.criteria.map((c, i) => (
        <section key={c.id} className="card space-y-3 p-5" aria-label={`Criterion ${i + 1}`}>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold">Criterion {i + 1}</span>
            <span className="muted text-xs">up to {criterionMax(c)} pts</span>
            <span className="flex-1" />
            <button type="button" className="btn-ghost btn-sm" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move criterion up">↑</button>
            <button type="button" className="btn-ghost btn-sm" onClick={() => move(i, 1)} disabled={i === draft.criteria.length - 1} aria-label="Move criterion down">↓</button>
            <button type="button" className="btn-ghost btn-sm text-red-600" onClick={() => setCriteria((cs) => cs.filter((x) => x.id !== c.id))} disabled={draft.criteria.length === 1}>Remove</button>
          </div>
          <input value={c.title} onChange={(e) => updateCriterion(c.id, { title: e.target.value })} placeholder="e.g. Organization" aria-label={`Criterion ${i + 1} title`} />
          <input value={c.description} onChange={(e) => updateCriterion(c.id, { description: e.target.value })} placeholder="What this criterion looks at (optional)" aria-label={`Criterion ${i + 1} description`} />
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {c.levels.map((l, j) => (
              <div key={l.id} className="space-y-1 rounded-lg border border-slate-200 p-2 dark:border-slate-700">
                <div className="flex gap-1">
                  <input value={l.label} onChange={(e) => updateLevel(c.id, l.id, { label: e.target.value })} placeholder="Level" aria-label={`Criterion ${i + 1} level ${j + 1} label`} className="min-w-0" />
                  <input
                    type="number"
                    min={0}
                    max={1000}
                    step="0.5"
                    value={l.points}
                    onChange={(e) => updateLevel(c.id, l.id, { points: Math.max(0, Number(e.target.value) || 0) })}
                    className="w-20"
                    aria-label={`Criterion ${i + 1} level ${j + 1} points`}
                  />
                </div>
                <textarea rows={2} value={l.description} onChange={(e) => updateLevel(c.id, l.id, { description: e.target.value })} placeholder="Description" aria-label={`Criterion ${i + 1} level ${j + 1} description`} className="text-xs" />
                {c.levels.length > 1 && (
                  <button type="button" className="muted text-xs hover:text-red-600" onClick={() => updateCriterion(c.id, { levels: c.levels.filter((x) => x.id !== l.id) })}>Remove level</button>
                )}
              </div>
            ))}
          </div>
          {c.levels.length < 10 && (
            <button type="button" className="btn-ghost btn-sm" onClick={() => updateCriterion(c.id, { levels: [...c.levels, { id: newId(), label: "", description: "", points: 0 }] })}>+ Add level</button>
          )}
        </section>
      ))}

      <div className="flex flex-wrap gap-2">
        {draft.criteria.length < 30 && (
          <button type="button" className="btn-secondary" onClick={() => setCriteria((cs) => [...cs, blankCriterion()])}>+ Add criterion</button>
        )}
      </div>

      <div className="card sticky bottom-20 z-10 flex flex-col gap-3 p-4 sm:flex-row sm:items-center lg:bottom-4">
        <div className="flex-1 text-sm">
          <p className="font-medium">{draft.criteria.length} criteria · {rubricMax(draft.criteria)} points possible</p>
          <p className={message?.error ? "text-red-600" : "muted text-xs"}>{message?.error ?? (dirty ? "Unsaved changes" : message?.ok ?? "Scores are scaled to each assignment's or question's points.")}</p>
        </div>
        <button type="button" className="btn-primary" disabled={pending} onClick={save}>{pending ? "Saving…" : "Save rubric"}</button>
      </div>
    </div>
  );
}
