"use client";

import { useState, useTransition } from "react";
import { answerKnowledgeCheck, resetKnowledgeCheck } from "@/lib/actions/courses";
import { isCorrect, type CheckBlock, type CheckProgress, type CheckResult, type CheckStats, type PublicCheckBlock } from "@/lib/knowledge-check";
import { cn } from "@/lib/utils";

type Props = {
  block: PublicCheckBlock | CheckBlock;
  /** Set on the lesson page: answers are checked (and recorded) on the server. Unset in the editor preview. */
  lessonId?: string;
  progress?: CheckProgress;
  stats?: CheckStats;
};

/** Ungraded practice questions with instant feedback and unlimited retries. */
export function KnowledgeCheck({ block, lessonId, progress, stats }: Props) {
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(Object.entries(progress ?? {}).map(([k, v]) => [k, v.value])));
  const [results, setResults] = useState<Record<string, CheckResult>>(() =>
    Object.fromEntries(Object.entries(progress ?? {}).map(([k, v]) => [k, { correct: v.correct, explanation: v.explanation }])),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, start] = useTransition();
  const total = block.questions.length;
  const correctCount = block.questions.filter((q) => results[q.id]?.correct).length;
  const answeredAll = block.questions.every((q) => results[q.id]);

  const check = (questionId: string) => {
    const value = values[questionId] ?? "";
    if (!value.trim()) return setErrors((e) => ({ ...e, [questionId]: "Choose or type an answer first." }));
    setErrors((e) => ({ ...e, [questionId]: "" }));
    const q = block.questions.find((x) => x.id === questionId)!;
    if (!lessonId) {
      // Editor preview: the full block (with answers) is already on the page.
      const full = q as CheckBlock["questions"][number];
      return setResults((r) => ({ ...r, [questionId]: { correct: isCorrect(full, value), explanation: full.explanation } }));
    }
    setPendingId(questionId);
    start(async () => {
      const res = await answerKnowledgeCheck(lessonId, block.id, questionId, value);
      setPendingId(null);
      if ("error" in res) setErrors((e) => ({ ...e, [questionId]: res.error }));
      else setResults((r) => ({ ...r, [questionId]: res }));
    });
  };
  const retry = (questionId: string) => {
    setResults((r) => {
      const next = { ...r };
      delete next[questionId];
      return next;
    });
    setValues((v) => ({ ...v, [questionId]: "" }));
  };
  const startOver = () => {
    setResults({});
    setValues({});
    if (lessonId) start(() => resetKnowledgeCheck(lessonId, block.id));
  };

  return (
    <section className="my-6 rounded-xl border-2 border-brand-200 bg-brand-50/40 p-4 sm:p-5 dark:border-brand-900 dark:bg-brand-950/20" aria-label={block.title || "Knowledge check"}>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-lg font-semibold">🧠 {block.title || "Knowledge check"}</h3>
        <span className="muted text-xs">Practice · not graded · {correctCount}/{total} correct</span>
      </div>
      <ol className="space-y-4">
        {block.questions.map((q, i) => {
          const result = results[q.id];
          const name = `${block.id}-${q.id}`;
          const value = values[q.id] ?? "";
          const set = (v: string) => setValues((s) => ({ ...s, [q.id]: v }));
          const s = stats?.[q.id];
          return (
            <li key={q.id} className="rounded-lg bg-white p-4 shadow-sm dark:bg-slate-900" data-testid="kc-question">
              <p className="font-medium whitespace-pre-wrap"><span className="muted mr-1">{i + 1}.</span>{q.prompt}</p>
              <fieldset disabled={!!result || pendingId === q.id} className="mt-3">
                <legend className="sr-only">Answer for question {i + 1}</legend>
                {q.kind === "mc" && (
                  <div className="space-y-2">
                    {q.options.map((opt, oi) =>
                      opt.trim() ? (
                        <label key={oi} className={cn("flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200 p-2.5 font-normal dark:border-slate-700", value === String(oi) && "border-brand-500 bg-brand-50 dark:bg-brand-950")}>
                          <input type="radio" name={name} value={oi} checked={value === String(oi)} onChange={() => set(String(oi))} /> {opt}
                        </label>
                      ) : null,
                    )}
                  </div>
                )}
                {q.kind === "tf" && (
                  <div className="grid grid-cols-2 gap-2">
                    {["true", "false"].map((v) => (
                      <label key={v} className={cn("flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200 p-2.5 font-normal capitalize dark:border-slate-700", value === v && "border-brand-500 bg-brand-50 dark:bg-brand-950")}>
                        <input type="radio" name={name} value={v} checked={value === v} onChange={() => set(v)} /> {v}
                      </label>
                    ))}
                  </div>
                )}
                {q.kind === "short" && (
                  <input value={value} onChange={(e) => set(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), check(q.id))} placeholder="Your answer" aria-label={`Answer for question ${i + 1}`} autoComplete="off" />
                )}
              </fieldset>
              {!result && (
                <button type="button" className="btn-primary btn-sm mt-3" onClick={() => check(q.id)} disabled={pendingId === q.id}>
                  {pendingId === q.id ? "Checking…" : "Check answer"}
                </button>
              )}
              {errors[q.id] && <p className="mt-2 text-sm text-red-600">{errors[q.id]}</p>}
              {result && (
                <div role="status" className={cn("mt-3 rounded-lg p-3 text-sm", result.correct ? "bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200" : "bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200")}>
                  <p className="font-semibold">{result.correct ? "✓ Correct!" : "✗ Not quite."}</p>
                  {result.explanation && <p className="mt-1 whitespace-pre-wrap">{result.explanation}</p>}
                  {!result.correct && <button type="button" className="btn-secondary btn-sm mt-2" onClick={() => retry(q.id)}>Try again</button>}
                </div>
              )}
              {s && (
                <p className="muted mt-3 border-t border-slate-100 pt-2 text-xs dark:border-slate-800" data-testid="kc-stats">
                  📊 Class: {s.learners ? `${Math.round((s.firstTry / s.learners) * 100)}% correct on first try · ${Math.round((s.correctNow / s.learners) * 100)}% correct now · ${s.learners} learner${s.learners === 1 ? "" : "s"}` : "no answers yet"}
                </p>
              )}
            </li>
          );
        })}
      </ol>
      {answeredAll && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-sm">
          <p className="font-medium">{correctCount === total ? "🎉 You got them all!" : `You got ${correctCount} of ${total} right.`}</p>
          <button type="button" className="btn-ghost btn-sm" onClick={startOver}>Start over</button>
        </div>
      )}
    </section>
  );
}
