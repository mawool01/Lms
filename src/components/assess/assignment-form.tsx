import Link from "next/link";
import { ActionForm, DateTimeInput, SubmitButton, type FormAction } from "@/components/forms";

export function AssignmentForm({
  action,
  values,
  submitLabel,
  rubrics,
}: {
  action: FormAction;
  values?: { title: string; description: string; maxPoints: number; weight: number; dueAt: Date | null; published: boolean; rubricId: string | null };
  submitLabel: string;
  rubrics: { id: string; label: string }[];
}) {
  return (
    <ActionForm action={action} className="space-y-4">
      <div className="field">
        <label htmlFor="a-title">Title</label>
        <input id="a-title" name="title" defaultValue={values?.title} required />
      </div>
      <div className="field">
        <label htmlFor="a-desc">Instructions <span className="muted font-normal">(Markdown)</span></label>
        <textarea id="a-desc" name="description" rows={5} defaultValue={values?.description} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="field">
          <label htmlFor="maxPoints">Max points</label>
          <input id="maxPoints" name="maxPoints" type="number" min={1} defaultValue={values?.maxPoints ?? 100} />
        </div>
        <div className="field">
          <label htmlFor="a-weight">Grade weight</label>
          <input id="a-weight" name="weight" type="number" min={0} defaultValue={values?.weight ?? 20} />
        </div>
      </div>
      <RubricSelect rubrics={rubrics} defaultValue={values?.rubricId} />
      <div className="field">
        <label>Due</label>
        <DateTimeInput name="dueAt" defaultValue={values?.dueAt?.toISOString()} />
      </div>
      <label className="flex items-center gap-2">
        <input type="checkbox" name="published" defaultChecked={values?.published ?? true} /> Published (visible to students)
      </label>
      <SubmitButton>{submitLabel}</SubmitButton>
    </ActionForm>
  );
}

/** "Grading rubric" picker shared by assignments and essay questions. */
export function RubricSelect({ rubrics, defaultValue, id = "rubricId" }: { rubrics: { id: string; label: string }[]; defaultValue?: string | null; id?: string }) {
  return (
    <div className="field">
      <label htmlFor={id}>Grading rubric <span className="muted font-normal">(optional)</span></label>
      <select id={id} name="rubricId" defaultValue={defaultValue ?? ""}>
        <option value="">No rubric</option>
        {rubrics.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
      </select>
      <p className="muted text-xs">Learners see the rubric up front. <Link href="/rubrics" className="link" target="_blank">Manage rubrics</Link></p>
    </div>
  );
}
