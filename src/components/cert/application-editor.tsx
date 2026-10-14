"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveApplication, submitApplication, type ApplicationDraft } from "@/lib/actions/certifications";
import { uploadToBlob } from "@/components/blob-upload";
import type { BlobClientConfig } from "@/lib/blob-config";
import { Markdown } from "@/components/markdown";
import { evidenceName } from "@/lib/certifications/status";

type Criterion = { id: string; section: string; title: string; guidance: string; evidenceRequired: boolean };

export function ApplicationEditor({
  applicationId,
  kind,
  criteria,
  initial,
  blob,
  userId,
}: {
  userId: string;
  applicationId: string;
  kind: "INDIVIDUAL" | "CENTER";
  criteria: Criterion[];
  initial: ApplicationDraft;
  blob: BlobClientConfig;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<ApplicationDraft>(() => ({
    ...initial,
    responses: criteria.map((c) => initial.responses.find((r) => r.criterionId === c.id) ?? { criterionId: c.id, narrative: "", evidence: [] }),
  }));
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState<{ error?: string; ok?: string }>();
  const [pending, startTransition] = useTransition();
  const latest = useRef(draft);
  latest.current = draft;

  const update = (patch: Partial<ApplicationDraft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setDirty(true);
  };
  const updateResponse = (criterionId: string, patch: Partial<ApplicationDraft["responses"][number]>) => {
    setDraft((d) => ({ ...d, responses: d.responses.map((r) => (r.criterionId === criterionId ? { ...r, ...patch } : r)) }));
    setDirty(true);
  };

  // Autosave 3 seconds after the last change.
  useEffect(() => {
    if (!dirty) return;
    const t = setTimeout(async () => {
      const result = await saveApplication(applicationId, latest.current);
      if (!result?.error) setDirty(false);
      setMessage(result?.error ? result : { ok: "Draft saved" });
    }, 3000);
    return () => clearTimeout(t);
  }, [draft, dirty, applicationId]);

  const submit = () =>
    startTransition(async () => {
      const result = await submitApplication(applicationId, latest.current);
      setMessage(result);
      if (!result?.error) {
        setDirty(false);
        router.refresh();
      }
    });

  const completed = draft.responses.filter((r, i) => r.narrative.trim() && (!criteria[i].evidenceRequired || r.evidence.length)).length;
  let lastSection = "";

  return (
    <div className="space-y-4">
      {kind === "CENTER" && (
        <div className="card grid gap-4 p-5 sm:grid-cols-2">
          <div className="field">
            <label htmlFor="centerName">Learning center name</label>
            <input id="centerName" value={draft.centerName ?? ""} onChange={(e) => update({ centerName: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="institution">Institution</label>
            <input id="institution" value={draft.institution ?? ""} onChange={(e) => update({ institution: e.target.value })} />
          </div>
        </div>
      )}

      <div className="card p-5">
        <label htmlFor="statement" className="font-semibold">{kind === "CENTER" ? "Cover letter / introduction" : "Introduction"} <span className="muted font-normal">(optional)</span></label>
        <textarea id="statement" rows={5} className="mt-2" value={draft.statement} onChange={(e) => update({ statement: e.target.value })} placeholder="Introduce yourself or your center. Markdown supported." />
      </div>

      {criteria.map((c, i) => {
        const r = draft.responses[i];
        const header = c.section && c.section !== lastSection ? c.section : null;
        lastSection = c.section;
        return (
          <div key={c.id}>
            {header && <h3 className="mt-6 mb-2 text-sm font-semibold tracking-wide text-slate-500 uppercase">{header}</h3>}
            <div className="card p-5">
              <div className="flex items-start justify-between gap-3">
                <h4 className="font-semibold">{i + 1}. {c.title}</h4>
                {r.narrative.trim() && (!c.evidenceRequired || r.evidence.length) ? <span className="text-emerald-600">✔</span> : null}
              </div>
              {c.guidance && <div className="muted mt-1 text-sm"><Markdown>{c.guidance}</Markdown></div>}
              <textarea rows={6} className="mt-3" value={r.narrative} onChange={(e) => updateResponse(c.id, { narrative: e.target.value })} placeholder="Your response…" aria-label={`Response for ${c.title}`} />
              <EvidenceList
                required={c.evidenceRequired}
                evidence={r.evidence}
                onChange={(evidence) => updateResponse(c.id, { evidence })}
                blob={blob}
                userId={userId}
              />
            </div>
          </div>
        );
      })}

      <div className="card sticky bottom-20 z-10 flex flex-col gap-3 p-4 sm:flex-row sm:items-center lg:bottom-4">
        <div className="flex-1 text-sm">
          <p className="font-medium">{completed} of {criteria.length} criteria complete</p>
          <p className={message?.error ? "text-red-600" : "muted text-xs"}>{message?.error ?? (dirty ? "Unsaved changes…" : message?.ok ?? "Changes save automatically")}</p>
        </div>
        <button
          type="button"
          className="btn-secondary"
          disabled={pending}
          onClick={() => startTransition(async () => {
            const result = await saveApplication(applicationId, latest.current);
            setMessage(result);
            if (!result?.error) setDirty(false);
          })}
        >
          Save draft
        </button>
        <button type="button" className="btn-primary" disabled={pending} onClick={submit}>{pending ? "Working…" : "Submit application"}</button>
      </div>
    </div>
  );
}

function EvidenceList({ evidence, onChange, required, blob, userId }: { evidence: string[]; onChange: (e: string[]) => void; required: boolean; blob: BlobClientConfig; userId: string }) {
  const [link, setLink] = useState("");
  const [uploading, setUploading] = useState<string | null>(null);
  const [error, setError] = useState("");
  const add = () => {
    const v = link.trim();
    if (!v) return;
    if (!/^https?:\/\//i.test(v)) return setError("Links must start with https://");
    onChange([...evidence, v]);
    setLink("");
    setError("");
  };
  const upload = async (file: File) => {
    if (!blob) return;
    setError("");
    setUploading("0%");
    try {
      const uploaded = await uploadToBlob(file, "cert-evidence", blob, (p) => setUploading(`${p}%`), userId);
      onChange([...evidence, uploaded.url]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(null);
    }
  };
  return (
    <div className="mt-3 rounded-lg bg-slate-50 p-3 dark:bg-slate-800/40">
      <p className="text-xs font-semibold">Evidence {required ? <span className="text-red-600">(required)</span> : <span className="muted font-normal">(optional)</span>}</p>
      {evidence.length > 0 && (
        <ul className="mt-2 space-y-1">
          {evidence.map((e, i) => (
            <li key={i} className="flex items-center gap-2 text-sm">
              <span>📎</span>
              <a href={e} target="_blank" rel="noopener noreferrer" className="link min-w-0 flex-1 truncate">{evidenceName(e)}</a>
              <button type="button" className="muted text-xs hover:text-red-600" onClick={() => onChange(evidence.filter((_, j) => j !== i))} aria-label="Remove">✕</button>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
        <input value={link} onChange={(e) => setLink(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), add())} placeholder="Paste a link (Google Drive, website, e-portfolio…)" aria-label="Evidence link" />
        <button type="button" className="btn-secondary shrink-0" onClick={add}>Add link</button>
        {blob && (
          <label className="btn-secondary shrink-0 cursor-pointer">
            {uploading ? `Uploading ${uploading}` : "Upload file"}
            <input type="file" className="hidden" disabled={!!uploading} onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
          </label>
        )}
      </div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
