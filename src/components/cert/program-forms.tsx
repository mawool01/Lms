import { ActionForm, SubmitButton, type FormAction } from "@/components/forms";

export function ProgramForm({
  action,
  values,
}: {
  action: FormAction;
  values?: { name: string; key: string; kind: "INDIVIDUAL" | "CENTER"; description: string; initialValidityMonths: number; renewalValidityMonths: number; active: boolean };
}) {
  return (
    <ActionForm action={action} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="field sm:col-span-2"><label htmlFor="p-name">Name</label><input id="p-name" name="name" defaultValue={values?.name} required /></div>
        <div className="field">
          <label htmlFor="p-kind">Who applies</label>
          <select id="p-kind" name="kind" defaultValue={values?.kind ?? "INDIVIDUAL"}>
            <option value="INDIVIDUAL">Individuals</option>
            <option value="CENTER">Learning centers</option>
          </select>
        </div>
      </div>
      {!values && <div className="field"><label htmlFor="p-key">Short key <span className="muted font-normal">(used in links and CSV import, e.g. lclc)</span></label><input id="p-key" name="key" /></div>}
      <div className="field"><label htmlFor="p-desc">Description <span className="muted font-normal">(Markdown)</span></label><textarea id="p-desc" name="description" rows={4} defaultValue={values?.description} /></div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="field"><label htmlFor="p-init">Initial certification valid for (months)</label><input id="p-init" name="initialValidityMonths" type="number" min={1} max={600} defaultValue={values?.initialValidityMonths ?? 24} /></div>
        <div className="field"><label htmlFor="p-ren">Renewals valid for (months)</label><input id="p-ren" name="renewalValidityMonths" type="number" min={1} max={600} defaultValue={values?.renewalValidityMonths ?? 60} /></div>
      </div>
      <label className="flex items-center gap-2"><input type="checkbox" name="active" defaultChecked={values?.active ?? true} /> Accepting applications</label>
      <SubmitButton>{values ? "Save program" : "Create program"}</SubmitButton>
    </ActionForm>
  );
}

export function LevelForm({ action, values }: { action: FormAction; values?: { name: string; description: string; feeNote: string; lifetime: boolean; active: boolean } }) {
  return (
    <ActionForm action={action} resetOnSuccess={!values} className="space-y-2">
      <div className="grid gap-2 sm:grid-cols-2">
        <input name="name" defaultValue={values?.name} placeholder="Level name, e.g. Level 2" aria-label="Level name" required />
        <input name="feeNote" defaultValue={values?.feeNote} placeholder="Fee, e.g. $50 initial / $75 renewal" aria-label="Fee" />
      </div>
      <textarea name="description" rows={3} defaultValue={values?.description} placeholder="Requirements for this level (Markdown)" aria-label="Requirements" />
      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-sm font-normal"><input type="checkbox" name="lifetime" defaultChecked={values?.lifetime} /> Lifetime (never expires)</label>
        {values && <label className="flex items-center gap-2 text-sm font-normal"><input type="checkbox" name="active" defaultChecked={values.active} /> Available</label>}
        <SubmitButton className="btn-secondary btn-sm">{values ? "Save level" : "Add level"}</SubmitButton>
      </div>
    </ActionForm>
  );
}

export function CriterionForm({
  action,
  levels,
  values,
}: {
  action: FormAction;
  levels: { id: string; name: string }[];
  values?: { title: string; section: string; guidance: string; evidenceRequired: boolean; levelId: string | null; active: boolean };
}) {
  return (
    <ActionForm action={action} resetOnSuccess={!values} className="space-y-2">
      <div className="grid gap-2 sm:grid-cols-3">
        <input name="title" defaultValue={values?.title} placeholder="Criterion / standard" aria-label="Title" required className="sm:col-span-2" />
        <input name="section" defaultValue={values?.section} placeholder="Section (optional)" aria-label="Section" />
      </div>
      <textarea name="guidance" rows={2} defaultValue={values?.guidance} placeholder="Guidance: what should applicants write and attach? (Markdown)" aria-label="Guidance" />
      <div className="flex flex-wrap items-center gap-4">
        <select name="levelId" defaultValue={values?.levelId ?? ""} className="w-auto py-1 text-sm" aria-label="Applies to">
          <option value="">All levels</option>
          {levels.map((l) => <option key={l.id} value={l.id}>Only {l.name}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm font-normal"><input type="checkbox" name="evidenceRequired" defaultChecked={values?.evidenceRequired ?? true} /> Evidence required</label>
        {values && <label className="flex items-center gap-2 text-sm font-normal"><input type="checkbox" name="active" defaultChecked={values.active} /> Active</label>}
        <SubmitButton className="btn-secondary btn-sm">{values ? "Save" : "Add criterion"}</SubmitButton>
      </div>
    </ActionForm>
  );
}
