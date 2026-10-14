"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { uploadToBlob } from "@/components/blob-upload";
import type { BlobClientConfig } from "@/lib/blob-config";

/** Uploads a SCORM .zip (directly to Vercel Blob when available) and imports it. */
export function ScormUpload({ courseId, moduleId, blobConfig, compact = false }: { courseId: string; moduleId?: string; blobConfig: BlobClientConfig; compact?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(!compact);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [gradeMethod, setGradeMethod] = useState<"SCORE" | "COMPLETION">("SCORE");
  const [weight, setWeight] = useState(20);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busy = status !== null;

  if (!open) {
    return (
      <button type="button" className="btn-secondary shrink-0" onClick={() => setOpen(true)}>
        📦 SCORM
      </button>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return setError("Choose a SCORM .zip file.");
    if (!/\.zip$/i.test(file.name)) return setError("SCORM packages must be .zip files.");
    setError(null);
    try {
      const options = { courseId, moduleId: moduleId ?? "", title, gradeMethod, weight: String(weight) };
      let res: Response;
      if (blobConfig) {
        setStatus("Uploading… 0%");
        const uploaded = await uploadToBlob(file, "scorm-uploads", blobConfig, (p) => setStatus(`Uploading… ${p}%`));
        setStatus("Unpacking and installing…");
        res = await fetch("/api/scorm/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...options, blobPathname: uploaded.pathname, blobAccess: uploaded.access }),
        });
      } else {
        setStatus("Uploading and installing…");
        res = await fetch(`/api/scorm/import?${new URLSearchParams(options)}`, { method: "POST", headers: { "Content-Type": "application/zip" }, body: file });
      }
      const json = await res.json().catch(() => ({ error: `Upload failed (${res.status})` }));
      if (!res.ok) throw new Error(json.error ?? "Upload failed");
      if (json.warning) alert(json.warning);
      router.push(json.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
      setStatus(null);
    }
  };

  return (
    <form onSubmit={submit} className="w-full space-y-3 rounded-xl border border-dashed border-brand-300 bg-brand-50/50 p-4 dark:border-brand-800 dark:bg-brand-950/20">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">📦 Upload a SCORM package</p>
        {compact && <button type="button" className="btn-ghost btn-sm" onClick={() => setOpen(false)} disabled={busy}>✕</button>}
      </div>
      <input type="file" accept=".zip,application/zip" onChange={(e) => setFile(e.target.files?.[0] ?? null)} disabled={busy} aria-label="SCORM zip file" required />
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title (optional — taken from the package)" disabled={busy} aria-label="Title" />
      <div className="grid gap-2 sm:grid-cols-2">
        <select value={gradeMethod} onChange={(e) => setGradeMethod(e.target.value as "SCORE" | "COMPLETION")} disabled={busy} aria-label="Grading">
          <option value="SCORE">Grade by package score</option>
          <option value="COMPLETION">Full credit on completion</option>
        </select>
        <label className="flex items-center gap-2 font-normal">
          <span className="shrink-0 text-sm">Grade weight</span>
          <input type="number" min={0} max={1000} value={weight} onChange={(e) => setWeight(Number(e.target.value))} disabled={busy} />
        </label>
      </div>
      <p className="muted text-xs">SCORM 1.2 and SCORM 2004 packages from Articulate, Captivate, iSpring, Elucidat and others. Max 500 MB. New packages start unpublished so you can preview them first.</p>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button className="btn-primary" disabled={busy}>{status ?? "Upload package"}</button>
    </form>
  );
}
