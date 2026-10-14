"use client";

import { useMemo, useState } from "react";
import { ActionForm, SubmitButton, type FormAction } from "@/components/forms";
import { uploadToBlob } from "@/components/blob-upload";
import type { BlobClientConfig } from "@/lib/blob-config";
import { PRESETS, type Branding } from "@/lib/branding-defaults";
import { brandScale, isHex, SHADES } from "@/lib/color";

/** Branding editor with a live preview that uses the same palette generator as the site. */
export function BrandingForm({ action, initial, blob }: { action: FormAction; initial: Branding; blob: BlobClientConfig }) {
  const [b, setB] = useState(initial);
  const set = <K extends keyof Branding>(k: K, v: Branding[K]) => setB((x) => ({ ...x, [k]: v }));
  const primary = useMemo(() => brandScale(isHex(b.primaryColor) ? b.primaryColor : initial.primaryColor), [b.primaryColor, initial.primaryColor]);
  const accent = useMemo(() => brandScale(isHex(b.accentColor) ? b.accentColor : initial.accentColor), [b.accentColor, initial.accentColor]);
  const previewVars = Object.fromEntries(SHADES.flatMap((s) => [[`--color-brand-${s}`, primary.scale[s]], [`--color-accent-${s}`, accent.scale[s]]])) as React.CSSProperties;

  return (
    <div className="grid gap-6 xl:grid-cols-5">
      <ActionForm action={action} className="space-y-6 xl:col-span-3">
        <section className="card space-y-4 p-5">
          <h2 className="font-semibold">Names</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Site name" hint="Sidebar, sign-in page, browser tab">
              <input name="siteName" value={b.siteName} onChange={(e) => set("siteName", e.target.value)} maxLength={60} required />
            </Field>
            <Field label="Short name" hint="e.g. ICLCA — used in labels and the certificate seal">
              <input name="shortName" value={b.shortName} onChange={(e) => set("shortName", e.target.value)} maxLength={20} required />
            </Field>
          </div>
          <Field label="Organization's full name" hint="Printed at the top of certificates and transcripts">
            <input name="orgName" value={b.orgName} onChange={(e) => set("orgName", e.target.value)} maxLength={120} required />
          </Field>
          <Field label="Tagline" hint="Under the name on the sign-in page">
            <input name="tagline" value={b.tagline} onChange={(e) => set("tagline", e.target.value)} maxLength={120} />
          </Field>
          <Field label="Sign-in page message" hint="Optional announcement shown above the sign-in form (Markdown)">
            <textarea name="loginMessage" rows={3} value={b.loginMessage} onChange={(e) => set("loginMessage", e.target.value)} maxLength={2000} placeholder="e.g. **Welcome!** Members: sign in with your ICLCA Wild Apricot login." />
          </Field>
        </section>

        <section className="card space-y-4 p-5">
          <h2 className="font-semibold">Colors</h2>
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <button
                key={p.name}
                type="button"
                className="flex items-center gap-2 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-medium hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
                onClick={() => setB((x) => ({ ...x, primaryColor: p.primary, accentColor: p.accent }))}
              >
                <span className="h-4 w-4 rounded-full" style={{ background: p.primary }} />
                <span className="-ml-3 h-4 w-4 rounded-full ring-2 ring-white dark:ring-slate-900" style={{ background: p.accent }} />
                {p.name}
              </button>
            ))}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <ColorField label="Primary color" hint="Buttons, links, highlights" name="primaryColor" value={b.primaryColor} onChange={(v) => set("primaryColor", v)} />
            <ColorField label="Accent color" hint="Badges, certificate seal and border" name="accentColor" value={b.accentColor} onChange={(v) => set("accentColor", v)} />
          </div>
          {primary.adjusted && (
            <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
              This primary color is too light for white text, so buttons will use a darker shade ({primary.scale[600]}) to stay readable.
            </p>
          )}
          <div className="space-y-1">
            {[primary, accent].map((p, i) => (
              <div key={i} className="flex overflow-hidden rounded-lg" aria-label={i ? "Accent palette" : "Primary palette"}>
                {SHADES.map((s) => <span key={s} className="h-6 flex-1" style={{ background: p.scale[s] }} title={`${s}: ${p.scale[s]}`} />)}
              </div>
            ))}
          </div>
        </section>

        <section className="card space-y-4 p-5">
          <h2 className="font-semibold">Logo & browser icon</h2>
          <ImageField label="Logo" hint="PNG with transparent background works best (also used on certificates; SVG logos show on the site only)" name="logoUrl" value={b.logoUrl} onChange={(v) => set("logoUrl", v)} blob={blob} />
          <ImageField label="Browser icon (favicon)" hint="Square image, at least 64×64. Leave empty to use the logo." name="faviconUrl" value={b.faviconUrl} onChange={(v) => set("faviconUrl", v)} blob={blob} />
        </section>

        <SubmitButton pendingText="Saving…">Save branding</SubmitButton>
      </ActionForm>

      <div className="xl:col-span-2">
        <div className="sticky top-4 space-y-2">
          <p className="muted text-xs font-semibold tracking-wide uppercase">Preview</p>
          <div style={previewVars} className="card overflow-hidden">
            <div className="flex">
              <div className="w-36 shrink-0 space-y-1 border-r border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
                <div className="mb-3 flex items-center gap-2 text-xs font-bold">
                  {b.logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={b.logoUrl} alt="" className="h-6 w-6 object-contain" />
                  ) : (
                    <span className="h-6 w-6 rounded-md bg-brand-600" />
                  )}
                  <span className="truncate">{b.siteName}</span>
                </div>
                <div className="rounded-md bg-brand-50 px-2 py-1 text-xs font-medium text-brand-700">🏠 Dashboard</div>
                <div className="px-2 py-1 text-xs text-slate-500">📘 Courses</div>
                <div className="px-2 py-1 text-xs text-slate-500">🎖️ Certifications</div>
              </div>
              <div className="min-w-0 flex-1 space-y-3 p-4">
                <div className="h-12 rounded-lg bg-gradient-to-br from-brand-500 to-brand-800" />
                <p className="text-sm font-semibold">Course title</p>
                <div className="flex flex-wrap gap-1">
                  <span className="rounded-full bg-brand-100 px-2 py-0.5 text-[10px] font-medium text-brand-800">Science</span>
                  <span className="rounded-full bg-accent-100 px-2 py-0.5 text-[10px] font-medium text-accent-800">🏅 Badge</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-200"><div className="h-full w-2/3 bg-brand-600" /></div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white">Primary button</span>
                  <span className="text-xs font-medium text-brand-600 underline">A link</span>
                </div>
              </div>
            </div>
            <div className="border-t border-slate-200 p-4 dark:border-slate-800">
              <div className="rounded-md border-4 border-brand-600 p-1">
                <div className="space-y-1 border border-accent-500 p-3 text-center">
                  <p className="text-[9px] font-bold tracking-wide text-brand-600 uppercase">{b.orgName}</p>
                  <p className="font-serif text-sm font-bold">Certificate of Certification</p>
                  <p className="font-serif text-xs text-brand-600">Jane Doe</p>
                  <span className="mx-auto mt-1 flex h-8 w-8 items-center justify-center rounded-full border-2 border-accent-500 bg-accent-50 text-[8px] font-bold text-accent-600">
                    {b.shortName.slice(0, 6)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
      {hint && <p className="muted text-xs">{hint}</p>}
    </div>
  );
}

function ColorField({ label, hint, name, value, onChange }: { label: string; hint: string; name: string; value: string; onChange: (v: string) => void }) {
  return (
    <Field label={label} hint={hint}>
      <div className="flex items-center gap-2">
        <input type="color" value={isHex(value) ? value : "#000000"} onChange={(e) => onChange(e.target.value)} className="h-10 w-14 cursor-pointer p-1" aria-label={`${label} picker`} />
        <input name={name} value={value} onChange={(e) => onChange(e.target.value.trim())} className="font-mono" maxLength={7} pattern="#[0-9a-fA-F]{6}" aria-label={`${label} hex`} />
      </div>
    </Field>
  );
}

function ImageField({ label, hint, name, value, onChange, blob }: { label: string; hint: string; name: string; value: string | null; onChange: (v: string | null) => void; blob: BlobClientConfig }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  return (
    <Field label={label} hint={hint}>
      <div className="flex items-center gap-3">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 dark:border-slate-700 dark:bg-slate-800">
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value} alt="" className="max-h-12 max-w-12 object-contain" />
          ) : (
            <span className="muted text-[10px]">None</span>
          )}
        </div>
        <input name={name} value={value ?? ""} onChange={(e) => onChange(e.target.value || null)} placeholder="https://… or upload" aria-label={`${label} URL`} />
        {blob && (
          <label className="btn-secondary shrink-0 cursor-pointer">
            {uploading ? "Uploading…" : "Upload"}
            <input
              type="file"
              accept="image/png,image/jpeg,image/svg+xml,image/webp,image/x-icon,image/gif"
              className="hidden"
              disabled={uploading}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setUploading(true);
                setError("");
                try {
                  onChange((await uploadToBlob(file, "branding", blob)).url);
                } catch (err) {
                  setError(err instanceof Error ? err.message : "Upload failed");
                } finally {
                  setUploading(false);
                }
              }}
            />
          </label>
        )}
        {value && <button type="button" className="muted shrink-0 text-xs hover:text-red-600" onClick={() => onChange(null)}>Remove</button>}
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </Field>
  );
}
