"use client";

import { useState } from "react";
import { ActionForm, SubmitButton, type FormAction } from "@/components/forms";
import { uploadToBlob } from "@/components/blob-upload";
import type { BlobClientConfig } from "@/lib/blob-config";
import { evidenceName } from "@/lib/certifications/status";

const ACCEPT = ".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.odt,.ods,.odp,.rtf,.txt,.csv,.zip,image/*,audio/*,video/*";
const MAX_FILES = 10;
const MAX_MB = 100;

/** Student submission: text response, uploaded documents and/or a link. */
export function SubmissionForm({
  action,
  initial,
  blob,
  userId,
  isUpdate,
}: {
  action: FormAction;
  initial: { content: string; linkUrl: string | null; files: string[] };
  blob: BlobClientConfig;
  userId: string;
  isUpdate: boolean;
}) {
  const [files, setFiles] = useState<string[]>(initial.files);
  const [uploading, setUploading] = useState<string | null>(null);
  const [error, setError] = useState("");

  const upload = async (list: FileList) => {
    if (!blob) return;
    setError("");
    for (const file of Array.from(list)) {
      if (files.length >= MAX_FILES) {
        setError(`You can attach up to ${MAX_FILES} files.`);
        break;
      }
      if (file.size > MAX_MB * 1024 * 1024) {
        setError(`${file.name} is larger than ${MAX_MB} MB.`);
        continue;
      }
      try {
        setUploading(`${file.name} 0%`);
        const uploaded = await uploadToBlob(file, "submissions", blob, (p) => setUploading(`${file.name} ${p}%`), userId);
        setFiles((f) => [...f, uploaded.url]);
      } catch (e) {
        setError(`${file.name}: ${e instanceof Error ? e.message : "upload failed"}`);
      }
    }
    setUploading(null);
  };

  return (
    <ActionForm action={action} className="space-y-4">
      <div className="field">
        <label htmlFor="content">Response <span className="muted font-normal">(optional if you attach files)</span></label>
        <textarea id="content" name="content" rows={6} defaultValue={initial.content} placeholder="Type your response or notes for your teacher…" />
      </div>

      <div className="field">
        <span className="text-sm font-medium">Files</span>
        <div
          className="rounded-xl border-2 border-dashed border-slate-300 p-4 text-center dark:border-slate-700"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            if (e.dataTransfer.files.length && !uploading) upload(e.dataTransfer.files);
          }}
        >
          {blob ? (
            <>
              <p className="muted text-sm">Drag files here, or</p>
              <label className="btn-secondary mt-2 cursor-pointer">
                {uploading ? `Uploading ${uploading}` : "📎 Choose files"}
                <input type="file" multiple accept={ACCEPT} className="hidden" disabled={!!uploading} onChange={(e) => e.target.files && upload(e.target.files)} />
              </label>
              <p className="muted mt-2 text-xs">PDF, Word, PowerPoint, Excel, images, audio/video and more · up to {MAX_FILES} files, {MAX_MB} MB each</p>
            </>
          ) : (
            <p className="muted text-sm">File uploads aren&apos;t set up on this site yet. Share a link to your document below instead.</p>
          )}
        </div>
        {files.length > 0 && (
          <ul className="mt-2 space-y-1">
            {files.map((f) => (
              <li key={f} className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm dark:bg-slate-800/50">
                <span>📄</span>
                <a href={f} target="_blank" rel="noopener noreferrer" className="link min-w-0 flex-1 truncate">{evidenceName(f)}</a>
                <button type="button" className="muted text-xs hover:text-red-600" onClick={() => setFiles((list) => list.filter((x) => x !== f))} aria-label={`Remove ${evidenceName(f)}`}>
                  Remove
                </button>
                <input type="hidden" name="files" value={f} />
              </li>
            ))}
          </ul>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>

      <div className="field">
        <label htmlFor="linkUrl">Link <span className="muted font-normal">(optional — Google Doc, video, website…)</span></label>
        <input id="linkUrl" name="linkUrl" type="url" defaultValue={initial.linkUrl ?? ""} placeholder="https://…" />
      </div>
      <SubmitButton pendingText="Submitting…">{isUpdate ? "Update submission" : "Submit"}</SubmitButton>
      {uploading && <p className="muted text-xs">Wait for uploads to finish before submitting.</p>}
    </ActionForm>
  );
}

/** Read-only list of submitted files (teacher grading view and graded student view). */
export function SubmittedFiles({ files }: { files: string[] }) {
  if (!files.length) return null;
  return (
    <ul className="space-y-1">
      {files.map((f) => (
        <li key={f} className="text-sm">
          📄 <a href={f} target="_blank" rel="noopener noreferrer" className="link break-all">{evidenceName(f)}</a>
        </li>
      ))}
    </ul>
  );
}
