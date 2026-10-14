"use client";

import { useState } from "react";
import { ActionForm, SubmitButton, type FormAction } from "@/components/forms";
import { RubricSelect } from "@/components/assess/assignment-form";

type QType = "MULTIPLE_CHOICE" | "TRUE_FALSE" | "SHORT_ANSWER" | "ESSAY";

export function QuestionForm({
  action,
  initial,
  submitLabel,
  rubrics,
}: {
  action: FormAction;
  initial?: { id?: string; type: QType; prompt: string; options: string[]; answer: string; points: number; rubricId: string | null };
  submitLabel: string;
  rubrics: { id: string; label: string }[];
}) {
  const [type, setType] = useState<QType>(initial?.type ?? "MULTIPLE_CHOICE");
  const [options, setOptions] = useState<string[]>(initial?.type === "MULTIPLE_CHOICE" ? initial.options : ["", "", "", ""]);
  return (
    <ActionForm action={action} resetOnSuccess={!initial} className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <select name="type" value={type} onChange={(e) => setType(e.target.value as QType)} className="sm:w-52" aria-label="Question type">
          <option value="MULTIPLE_CHOICE">Multiple choice</option>
          <option value="TRUE_FALSE">True / False</option>
          <option value="SHORT_ANSWER">Short answer</option>
          <option value="ESSAY">Essay (teacher graded)</option>
        </select>
        <input name="points" type="number" min={1} max={1000} defaultValue={initial?.points ?? 1} className="sm:w-28" aria-label="Points" title="Points" />
      </div>
      <textarea name="prompt" rows={2} defaultValue={initial?.prompt} placeholder="Question text" aria-label="Question" required />

      {type === "MULTIPLE_CHOICE" && (
        <div className="space-y-2">
          <p className="muted text-xs">Select the radio button next to the correct answer.</p>
          {options.map((opt, i) => (
            <div key={i} className="flex items-center gap-2">
              <input type="radio" name="correct" value={i} defaultChecked={initial ? String(i) === initial.answer : i === 0} aria-label={`Choice ${i + 1} is correct`} />
              <input name="option" value={opt} onChange={(e) => setOptions((o) => o.map((x, j) => (j === i ? e.target.value : x)))} placeholder={`Choice ${i + 1}`} />
              {options.length > 2 && (
                <button type="button" className="btn-ghost btn-sm" onClick={() => setOptions((o) => o.filter((_, j) => j !== i))} aria-label="Remove choice">✕</button>
              )}
            </div>
          ))}
          {options.length < 8 && (
            <button type="button" className="btn-ghost btn-sm" onClick={() => setOptions((o) => [...o, ""])}>+ Add choice</button>
          )}
        </div>
      )}
      {type === "TRUE_FALSE" && (
        <div className="flex gap-6">
          <label className="flex items-center gap-2"><input type="radio" name="tf" value="true" defaultChecked={initial?.answer !== "false"} /> True</label>
          <label className="flex items-center gap-2"><input type="radio" name="tf" value="false" defaultChecked={initial?.answer === "false"} /> False</label>
        </div>
      )}
      {type === "SHORT_ANSWER" && (
        <div className="field">
          <input name="accepted" defaultValue={initial?.type === "SHORT_ANSWER" ? initial.answer : ""} placeholder="Accepted answers, separated by |  e.g. photosynthesis | photo-synthesis" />
          <p className="muted text-xs">Matching ignores capitalization and extra spaces.</p>
        </div>
      )}
      {type === "ESSAY" && (
        <div className="space-y-3">
          <div className="field">
            <input name="guidance" defaultValue={initial?.type === "ESSAY" ? initial.answer : ""} placeholder="Guidance for learners (optional), e.g. Aim for 250–400 words and cite one source." aria-label="Essay guidance" />
            <p className="muted text-xs">Essays are scored by a teacher after the attempt is submitted.</p>
          </div>
          <RubricSelect rubrics={rubrics} defaultValue={initial?.rubricId} id={`rubric-${initial?.id ?? "new"}`} />
        </div>
      )}
      <SubmitButton className="btn-primary btn-sm">{submitLabel}</SubmitButton>
    </ActionForm>
  );
}
