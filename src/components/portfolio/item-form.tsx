"use client";

import { useState } from "react";
import { ActionForm, SubmitButton, type FormAction } from "@/components/forms";
import { uploadToBlob } from "@/components/blob-upload";
import type { BlobClientConfig } from "@/lib/blob-config";
import { evidenceName } from "@/lib/certifications/status";
import { ITEM_TYPES, type ItemType } from "@/lib/portfolio-meta";

type Values = {
  title: string;
  organization: string | null;
  role: string | null;
  location: string | null;
  startDate: string | null; // ISO
  endDate: string | null;
  current: boolean;
  description: string;
  url: string | null;
  files: string[];
  hours: number | null;
  collaborators: string | null;
};

const month = (iso: string | null) => (iso ? iso.slice(0, 7) : "");
const ACCEPT = ".pdf,.ppt,.pptx,.key,.doc,.docx,.xls,.xlsx,.odp,.odt,.txt,.zip,image/*,audio/*,video/*";

/** Add / edit form for one portfolio item. */
export function PortfolioItemForm({
  type,
  action,
  values,
  blob,
  userId,
}: {
  type: ItemType;
  action: FormAction;
  values?: Values;
  blob: BlobClientConfig;
  userId: string;
}) {
  const meta = ITEM_TYPES[type];
  const [files, setFiles] = useState<string[]>(values?.files ?? []);
  const [current, setCurrent] = useState(values?.current ?? false);
  const [uploading, setUploading] = useState<string | null>(null);
  const [error, setError] = useState("");

  const upload = async (list: FileList) => {
    if (!blob) return;
    setError("");
    for (const file of Array.from(list)) {
      try {
        setUploading(`${file.name} 0%`);
        const up = await uploadToBlob(file, "portfolio", blob, (p) => setUploading(`${file.name} ${p}%`), userId);
        setFiles((f) => [...f, up.url]);
      } catch (e) {
        setError(`${file.name}: ${e instanceof Error ? e.message : "upload failed"}`);
      }
    }
    setUploading(null);
  };

  return (
    <ActionForm
      action={action}
      resetOnSuccess={!values}
      // On the blank "add" form, form.reset() can't clear these — without this
      // the files and the "currently hold this role" tick carried over and were
      // attached to the next entry too. The edit form keeps what was just saved.
      onSuccess={
        values
          ? undefined
          : () => {
              setFiles([]);
              setCurrent(false);
              setError("");
            }
      }
      className="space-y-3"
    >
      <input type="hidden" name="type" value={type} />
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="field sm:col-span-2">
          <label>{type === "POSITION" ? "Job title" : "Title"}</label>
          <input name="title" defaultValue={values?.title} placeholder={meta.placeholderTitle} required />
        </div>
        <div className="field">
          <label>{meta.org}</label>
          <input name="organization" defaultValue={values?.organization ?? ""} />
        </div>
        {meta.role ? (
          <div className="field">
            <label>{meta.role}</label>
            <input name="role" defaultValue={values?.role ?? ""} placeholder="e.g. Chair, Member, Reviewer" />
          </div>
        ) : (
          <div className="field">
            <label>Location <span className="muted font-normal">(optional)</span></label>
            <input name="location" defaultValue={values?.location ?? ""} placeholder="City, State or Virtual" />
          </div>
        )}
        <div className="field">
          <label>{meta.dates === "range" ? "Start" : "Date"}</label>
          <input name="startDate" type="month" defaultValue={month(values?.startDate ?? null)} />
        </div>
        {meta.dates === "range" && (
          <div className="field">
            <label>End</label>
            <input name="endDate" type="month" defaultValue={month(values?.endDate ?? null)} disabled={current} />
            <label className="mt-1 flex items-center gap-2 text-xs font-normal">
              <input type="checkbox" name="current" checked={current} onChange={(e) => setCurrent(e.target.checked)} /> I currently hold this role
            </label>
          </div>
        )}
        {type === "PROFESSIONAL_DEVELOPMENT" && (
          <div className="field">
            <label>Hours</label>
            <input name="hours" type="number" min={0} step="0.25" defaultValue={values?.hours ?? ""} />
          </div>
        )}
        {(type === "PRESENTATION" || type === "PUBLICATION") && (
          <div className="field sm:col-span-2">
            <label>{type === "PRESENTATION" ? "Co-presenters" : "Co-authors"} <span className="muted font-normal">(optional)</span></label>
            <input name="collaborators" defaultValue={values?.collaborators ?? ""} />
          </div>
        )}
      </div>
      <div className="field">
        <label>Description <span className="muted font-normal">(optional, Markdown)</span></label>
        <textarea name="description" rows={3} defaultValue={values?.description} />
      </div>
      <div className="field">
        <label>Link <span className="muted font-normal">(optional — article, recording, slides online…)</span></label>
        <input name="url" type="url" defaultValue={values?.url ?? ""} placeholder="https://…" />
      </div>
      <div className="field">
        <span className="text-sm font-medium">Files <span className="muted font-normal">(slides, handouts, certificates…)</span></span>
        {files.length > 0 && (
          <ul className="space-y-1">
            {files.map((f) => (
              <li key={f} className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-1.5 text-sm dark:bg-slate-800/50">
                📎 <a href={f} target="_blank" rel="noopener noreferrer" className="link min-w-0 flex-1 truncate">{evidenceName(f)}</a>
                <button type="button" className="muted text-xs hover:text-red-600" onClick={() => setFiles((l) => l.filter((x) => x !== f))} aria-label={`Remove ${evidenceName(f)}`}>Remove</button>
                <input type="hidden" name="files" value={f} />
              </li>
            ))}
          </ul>
        )}
        {blob ? (
          <label className="btn-secondary w-fit cursor-pointer">
            {uploading ? `Uploading ${uploading}` : "📎 Attach files"}
            <input type="file" multiple accept={ACCEPT} className="hidden" disabled={!!uploading} onChange={(e) => e.target.files && upload(e.target.files)} />
          </label>
        ) : (
          <p className="muted text-xs">File uploads aren&apos;t set up on this site — add a link instead.</p>
        )}
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>
      {/* "Save …", not "Add …": the disclosure that opens a blank form already
          says "+ Add position", so repeating it on the submit button made it
          unclear which one actually added anything. */}
      <SubmitButton className="btn-primary btn-sm">Save {meta.singular.toLowerCase()}</SubmitButton>
    </ActionForm>
  );
}
