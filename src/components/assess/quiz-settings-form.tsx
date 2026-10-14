import { ActionForm, DateTimeInput, SubmitButton, type FormAction } from "@/components/forms";

export function QuizSettingsForm({
  action,
  values,
  submitLabel,
}: {
  action: FormAction;
  values?: { title: string; description: string; passingScore: number; maxAttempts: number; weight: number; dueAt: Date | null; published: boolean };
  submitLabel: string;
}) {
  return (
    <ActionForm action={action} className="space-y-4">
      <div className="field">
        <label htmlFor="quiz-title">Title</label>
        <input id="quiz-title" name="title" defaultValue={values?.title} required />
      </div>
      <div className="field">
        <label htmlFor="quiz-desc">Instructions</label>
        <textarea id="quiz-desc" name="description" rows={2} defaultValue={values?.description} />
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="field">
          <label htmlFor="passingScore">Passing %</label>
          <input id="passingScore" name="passingScore" type="number" min={0} max={100} defaultValue={values?.passingScore ?? 70} />
        </div>
        <div className="field">
          <label htmlFor="maxAttempts">Attempts <span className="muted font-normal">(0 = ∞)</span></label>
          <input id="maxAttempts" name="maxAttempts" type="number" min={0} max={100} defaultValue={values?.maxAttempts ?? 3} />
        </div>
        <div className="field">
          <label htmlFor="weight">Grade weight</label>
          <input id="weight" name="weight" type="number" min={0} max={1000} defaultValue={values?.weight ?? 10} />
        </div>
        <div className="field col-span-2 sm:col-span-1">
          <label>Due</label>
          <DateTimeInput name="dueAt" defaultValue={values?.dueAt?.toISOString()} />
        </div>
      </div>
      {values && (
        <label className="flex items-center gap-2">
          <input type="checkbox" name="published" defaultChecked={values.published} /> Published (visible to students)
        </label>
      )}
      <SubmitButton>{submitLabel}</SubmitButton>
    </ActionForm>
  );
}
