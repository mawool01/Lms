import { ActionForm, SubmitButton, type FormAction } from "@/components/forms";

type CourseValues = {
  title: string;
  code: string;
  description: string;
  category: string;
  coverUrl: string | null;
  meetingUrl: string | null;
  published?: boolean;
  teacherId?: string;
};

export function CourseForm({
  action,
  values,
  submitLabel,
  teachers,
}: {
  action: FormAction;
  values?: CourseValues;
  submitLabel: string;
  teachers?: { id: string; name: string }[];
}) {
  return (
    <ActionForm action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="field sm:col-span-2">
          <label htmlFor="title">Course title</label>
          <input id="title" name="title" defaultValue={values?.title} required />
        </div>
        <div className="field">
          <label htmlFor="code">Course code</label>
          <input id="code" name="code" defaultValue={values?.code} placeholder="e.g. BIO101" required />
        </div>
      </div>
      <div className="field">
        <label htmlFor="description">Description</label>
        <textarea id="description" name="description" rows={4} defaultValue={values?.description} placeholder="What will students learn? Markdown supported." />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="field">
          <label htmlFor="category">Category</label>
          <input id="category" name="category" defaultValue={values?.category ?? "General"} />
        </div>
        <div className="field">
          <label htmlFor="coverUrl">Cover image URL <span className="muted font-normal">(optional)</span></label>
          <input id="coverUrl" name="coverUrl" type="url" defaultValue={values?.coverUrl ?? ""} placeholder="https://…" />
        </div>
      </div>
      <div className="field">
        <label htmlFor="meetingUrl">Live class link <span className="muted font-normal">(Zoom, Google Meet or Teams — optional)</span></label>
        <input id="meetingUrl" name="meetingUrl" type="url" defaultValue={values?.meetingUrl ?? ""} placeholder="https://zoom.us/j/…" />
      </div>
      {teachers && (
        <div className="field">
          <label htmlFor="teacherId">Instructor</label>
          <select id="teacherId" name="teacherId" defaultValue={values?.teacherId}>
            {teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
      )}
      {values?.published !== undefined && (
        <label className="flex items-center gap-2">
          <input type="checkbox" name="published" defaultChecked={values.published} />
          Published — visible in the Learning Center so students can enroll
        </label>
      )}
      <SubmitButton pendingText="Saving…">{submitLabel}</SubmitButton>
    </ActionForm>
  );
}
