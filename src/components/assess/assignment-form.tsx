import { ActionForm, DateTimeInput, SubmitButton, type FormAction } from "@/components/forms";

export function AssignmentForm({
  action,
  values,
  submitLabel,
}: {
  action: FormAction;
  values?: { title: string; description: string; maxPoints: number; weight: number; dueAt: Date | null; published: boolean };
  submitLabel: string;
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
