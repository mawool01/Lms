"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { uploadToBlob } from "@/components/blob-upload";
import type { BlobClientConfig } from "@/lib/blob-config";
import { BLOCK_LABELS, type Block, type BlockType } from "@/lib/blocks";
import { saveLesson } from "@/lib/actions/courses";
import { BlockRenderer } from "./block-renderer";

function newBlock(type: BlockType): Block {
  const id = crypto.randomUUID();
  switch (type) {
    case "text": return { id, type, markdown: "" };
    case "callout": return { id, type, tone: "info", markdown: "" };
    case "image": return { id, type, url: "", caption: "" };
    case "video": return { id, type, url: "", caption: "" };
    case "chart": return { id, type, chartType: "bar", title: "", data: "Month,Score\nJan,72\nFeb,80\nMar,86" };
    case "embed": return { id, type, url: "", height: 480 };
    case "file": return { id, type, url: "", name: "Download" };
    case "check": return { id, type, title: "Knowledge check", questions: [newCheckQuestion("mc")] };
  }
}

type CheckQ = Extract<Block, { type: "check" }>["questions"][number];

function newCheckQuestion(kind: CheckQ["kind"]): CheckQ {
  return { id: crypto.randomUUID(), kind, prompt: "", options: kind === "mc" ? ["", "", ""] : [], answer: kind === "mc" ? "0" : kind === "tf" ? "true" : "", explanation: "" };
}

const ICONS: Record<BlockType, string> = { text: "📝", callout: "💡", image: "🖼️", video: "🎬", chart: "📊", embed: "🧩", file: "📎", check: "🧠" };

export function LessonEditor({
  lessonId,
  courseId,
  initial,
  uploadsEnabled,
}: {
  lessonId: string;
  courseId: string;
  initial: { title: string; points: number; blocks: Block[] };
  uploadsEnabled: BlobClientConfig;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(initial.title);
  const [points, setPoints] = useState(initial.points);
  const [blocks, setBlocks] = useState<Block[]>(initial.blocks);
  const [preview, setPreview] = useState(false);
  const [message, setMessage] = useState<{ error?: string; ok?: string }>();
  const [dirty, setDirty] = useState(false);
  const [pending, startTransition] = useTransition();

  const update = (id: string, patch: Partial<Block>) => {
    setBlocks((bs) => bs.map((b) => (b.id === id ? ({ ...b, ...patch } as Block) : b)));
    setDirty(true);
  };
  const move = (index: number, dir: -1 | 1) => {
    setBlocks((bs) => {
      const next = [...bs];
      const t = index + dir;
      if (t < 0 || t >= next.length) return bs;
      [next[index], next[t]] = [next[t], next[index]];
      return next;
    });
    setDirty(true);
  };
  const add = (type: BlockType, at = blocks.length) => {
    setBlocks((bs) => [...bs.slice(0, at), newBlock(type), ...bs.slice(at)]);
    setDirty(true);
  };
  const remove = (id: string) => {
    setBlocks((bs) => bs.filter((b) => b.id !== id));
    setDirty(true);
  };

  const save = (thenView = false) =>
    startTransition(async () => {
      const result = await saveLesson(lessonId, { title, points, blocks });
      setMessage(result);
      if (!result?.error) {
        setDirty(false);
        if (thenView) router.push(`/courses/${courseId}/lessons/${lessonId}`);
        else router.refresh();
      }
    });

  return (
    <div className="space-y-4">
      <div className="card sticky top-14 z-20 flex flex-col gap-3 p-4 sm:flex-row sm:items-end lg:top-2">
        <div className="field flex-1">
          <label htmlFor="lesson-title">Lesson title</label>
          <input id="lesson-title" value={title} onChange={(e) => { setTitle(e.target.value); setDirty(true); }} />
        </div>
        <div className="field sm:w-28">
          <label htmlFor="lesson-points">Points</label>
          <input id="lesson-points" type="number" min={0} max={1000} value={points} onChange={(e) => { setPoints(Number(e.target.value)); setDirty(true); }} />
        </div>
        <div className="flex gap-2">
          <button type="button" className="btn-secondary" onClick={() => setPreview((p) => !p)}>{preview ? "✏️ Edit" : "👁 Preview"}</button>
          <button type="button" className="btn-secondary" disabled={pending} onClick={() => save(false)}>Save</button>
          <button type="button" className="btn-primary" disabled={pending} onClick={() => save(true)}>{pending ? "Saving…" : "Save & view"}</button>
        </div>
      </div>
      {message?.error && <p className="text-sm text-red-600">{message.error}</p>}
      {message?.ok && !dirty && <p className="text-sm text-emerald-600">{message.ok}</p>}

      {preview ? (
        <div className="card p-5 sm:p-8">
          <h2 className="mb-4 text-2xl font-bold">{title}</h2>
          {blocks.map((b) => <BlockRenderer key={b.id} block={b} />)}
        </div>
      ) : (
        <>
          {blocks.map((block, i) => (
            <div key={block.id} className="card p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <span className="text-sm font-semibold">{ICONS[block.type]} {BLOCK_LABELS[block.type]}</span>
                <div className="flex gap-1">
                  <button type="button" className="btn-ghost btn-sm" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up">↑</button>
                  <button type="button" className="btn-ghost btn-sm" onClick={() => move(i, 1)} disabled={i === blocks.length - 1} aria-label="Move down">↓</button>
                  <button type="button" className="btn-ghost btn-sm text-red-600" onClick={() => remove(block.id)} aria-label="Delete block">✕</button>
                </div>
              </div>
              <BlockFields block={block} onChange={(patch) => update(block.id, patch)} uploadsEnabled={uploadsEnabled} />
            </div>
          ))}
          <div className="card flex flex-wrap items-center gap-2 border-dashed p-4">
            <span className="muted mr-1 text-sm font-medium">Add block:</span>
            {(Object.keys(BLOCK_LABELS) as BlockType[]).map((t) => (
              <button key={t} type="button" className="btn-secondary btn-sm" onClick={() => add(t)}>
                {ICONS[t]} {BLOCK_LABELS[t]}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function BlockFields({ block, onChange, uploadsEnabled }: { block: Block; onChange: (patch: Partial<Block>) => void; uploadsEnabled: BlobClientConfig }) {
  switch (block.type) {
    case "text":
      return (
        <>
          <textarea rows={8} value={block.markdown} onChange={(e) => onChange({ markdown: e.target.value })} placeholder="Write lesson content… Markdown supported: **bold**, # headings, - lists, [links](https://…), tables" className="font-mono" />
          <p className="muted mt-1 text-xs">Supports Markdown formatting, including tables and checklists.</p>
        </>
      );
    case "callout":
      return (
        <div className="space-y-2">
          <select value={block.tone} onChange={(e) => onChange({ tone: e.target.value as "info" | "tip" | "warning" })} className="sm:w-48">
            <option value="info">ℹ️ Info</option>
            <option value="tip">💡 Tip</option>
            <option value="warning">⚠️ Warning</option>
          </select>
          <textarea rows={3} value={block.markdown} onChange={(e) => onChange({ markdown: e.target.value })} placeholder="Callout text…" />
        </div>
      );
    case "image":
    case "video":
      return (
        <div className="space-y-2">
          <UrlField
            value={block.url}
            onChange={(url) => onChange({ url })}
            placeholder={block.type === "video" ? "YouTube, Vimeo, Loom or .mp4 URL" : "https://… image URL"}
            accept={block.type === "video" ? "video/*" : "image/*"}
            uploadsEnabled={uploadsEnabled}
          />
          <input value={block.caption} onChange={(e) => onChange({ caption: e.target.value })} placeholder="Caption (optional)" />
        </div>
      );
    case "chart":
      return (
        <div className="space-y-2">
          <div className="flex flex-col gap-2 sm:flex-row">
            <select value={block.chartType} onChange={(e) => onChange({ chartType: e.target.value as "bar" | "line" | "pie" | "area" })} className="sm:w-40">
              <option value="bar">Bar chart</option>
              <option value="line">Line graph</option>
              <option value="area">Area chart</option>
              <option value="pie">Pie chart</option>
            </select>
            <input value={block.title} onChange={(e) => onChange({ title: e.target.value })} placeholder="Chart title (optional)" />
          </div>
          <textarea rows={5} value={block.data} onChange={(e) => onChange({ data: e.target.value })} className="font-mono" />
          <p className="muted text-xs">Comma-separated data. First row is the header: <code>Label,Series 1,Series 2</code>. Pie charts use the first series.</p>
        </div>
      );
    case "embed":
      return (
        <div className="space-y-1">
          <div className="flex flex-col gap-2 sm:flex-row">
            <input value={block.url} onChange={(e) => onChange({ url: e.target.value })} placeholder="https://… (Google Slides/Docs/Sheets/Forms, Drive, Canva, Desmos, PhET…)" />
            <input type="number" value={block.height} min={200} max={1200} onChange={(e) => onChange({ height: Number(e.target.value) })} className="sm:w-28" aria-label="Height" />
          </div>
          <p className="muted text-xs">
            Paste the normal share link — Google links are converted to embed links automatically. For Google files, set sharing to
            &ldquo;Anyone with the link can view&rdquo; so students can see them.
          </p>
        </div>
      );
    case "file":
      return (
        <div className="space-y-2">
          <UrlField value={block.url} onChange={(url) => onChange({ url })} placeholder="https://… link to a PDF, doc or resource" uploadsEnabled={uploadsEnabled} />
          <input value={block.name} onChange={(e) => onChange({ name: e.target.value })} placeholder="Link text" />
        </div>
      );
    case "check":
      return <CheckFields block={block} onChange={onChange} />;
  }
}

function CheckFields({ block, onChange }: { block: Extract<Block, { type: "check" }>; onChange: (patch: Partial<Block>) => void }) {
  const setQuestions = (fn: (qs: CheckQ[]) => CheckQ[]) => onChange({ questions: fn(block.questions) });
  const updateQ = (id: string, patch: Partial<CheckQ>) => setQuestions((qs) => qs.map((q) => (q.id === id ? { ...q, ...patch } : q)));
  return (
    <div className="space-y-3">
      <input value={block.title} onChange={(e) => onChange({ title: e.target.value })} placeholder="Title, e.g. Check your understanding" aria-label="Knowledge check title" />
      <p className="muted text-xs">Practice questions with instant feedback. Learners can retry as often as they like; nothing counts toward grades. You&apos;ll see class results on the lesson page.</p>
      {block.questions.map((q, i) => (
        <div key={q.id} className="space-y-2 rounded-lg border border-slate-200 p-3 dark:border-slate-700" data-testid="kc-editor-question">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold">Question {i + 1}</span>
            <select
              value={q.kind}
              onChange={(e) => {
                const kind = e.target.value as CheckQ["kind"];
                updateQ(q.id, { ...newCheckQuestion(kind), id: q.id, prompt: q.prompt, explanation: q.explanation });
              }}
              className="w-44"
              aria-label={`Question ${i + 1} type`}
            >
              <option value="mc">Multiple choice</option>
              <option value="tf">True / False</option>
              <option value="short">Short answer</option>
            </select>
            <span className="flex-1" />
            {block.questions.length > 1 && (
              <button type="button" className="btn-ghost btn-sm text-red-600" onClick={() => setQuestions((qs) => qs.filter((x) => x.id !== q.id))}>Remove</button>
            )}
          </div>
          <textarea rows={2} value={q.prompt} onChange={(e) => updateQ(q.id, { prompt: e.target.value })} placeholder="Question" aria-label={`Question ${i + 1} text`} />
          {q.kind === "mc" && (
            <div className="space-y-1.5">
              <p className="muted text-xs">Select the correct choice.</p>
              {q.options.map((opt, oi) => (
                <div key={oi} className="flex items-center gap-2">
                  <input type="radio" name={`kc-correct-${q.id}`} checked={q.answer === String(oi)} onChange={() => updateQ(q.id, { answer: String(oi) })} aria-label={`Choice ${oi + 1} is correct`} />
                  <input value={opt} onChange={(e) => updateQ(q.id, { options: q.options.map((o, j) => (j === oi ? e.target.value : o)) })} placeholder={`Choice ${oi + 1}`} aria-label={`Question ${i + 1} choice ${oi + 1}`} />
                  {q.options.length > 2 && (
                    <button
                      type="button"
                      className="btn-ghost btn-sm"
                      aria-label="Remove choice"
                      onClick={() => {
                        const answer = Number(q.answer);
                        updateQ(q.id, { options: q.options.filter((_, j) => j !== oi), answer: String(answer === oi ? 0 : answer > oi ? answer - 1 : answer) });
                      }}
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
              {q.options.length < 8 && <button type="button" className="btn-ghost btn-sm" onClick={() => updateQ(q.id, { options: [...q.options, ""] })}>+ Add choice</button>}
            </div>
          )}
          {q.kind === "tf" && (
            <div className="flex gap-6 text-sm">
              {["true", "false"].map((v) => (
                <label key={v} className="flex items-center gap-2 font-normal capitalize">
                  <input type="radio" name={`kc-tf-${q.id}`} checked={q.answer === v} onChange={() => updateQ(q.id, { answer: v })} /> {v}
                </label>
              ))}
            </div>
          )}
          {q.kind === "short" && (
            <input value={q.answer} onChange={(e) => updateQ(q.id, { answer: e.target.value })} placeholder="Accepted answers, separated by |" aria-label={`Question ${i + 1} accepted answers`} />
          )}
          <textarea rows={2} value={q.explanation} onChange={(e) => updateQ(q.id, { explanation: e.target.value })} placeholder="Explanation shown after answering (optional)" aria-label={`Question ${i + 1} explanation`} />
        </div>
      ))}
      {block.questions.length < 30 && (
        <button type="button" className="btn-secondary btn-sm" onClick={() => setQuestions((qs) => [...qs, newCheckQuestion("mc")])}>+ Add question</button>
      )}
    </div>
  );
}

function UrlField({ value, onChange, placeholder, accept, uploadsEnabled }: { value: string; onChange: (v: string) => void; placeholder: string; accept?: string; uploadsEnabled: BlobClientConfig }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  async function upload(file: File) {
    setUploading(true);
    setError("");
    try {
      const uploaded = await uploadToBlob(file, "uploads", uploadsEnabled!);
      onChange(uploaded.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }
  return (
    <div>
      <div className="flex gap-2">
        <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
        {!!uploadsEnabled && (
          <label className="btn-secondary shrink-0 cursor-pointer">
            {uploading ? "Uploading…" : "Upload"}
            <input type="file" accept={accept} className="hidden" disabled={uploading} onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
          </label>
        )}
      </div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
