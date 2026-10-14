import type { Block } from "@/lib/blocks";
import { embedUrl, isSafeUrl, videoEmbedUrl } from "@/lib/blocks";
import { Markdown } from "@/components/markdown";
import { ChartBlock } from "./chart-block";
import { KnowledgeCheck } from "./knowledge-check";
import { toPublicCheck, type CheckProgress, type CheckStats } from "@/lib/knowledge-check";

const CALLOUT_STYLES = {
  info: { cls: "border-sky-300 bg-sky-50 dark:border-sky-800 dark:bg-sky-950/40", icon: "ℹ️" },
  tip: { cls: "border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/40", icon: "💡" },
  warning: { cls: "border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40", icon: "⚠️" },
};

/**
 * Renders one lesson block. Pass `lessonId` on the lesson page so knowledge checks are answered on the server
 * (their answers never reach the browser); without it (editor preview) they are checked locally.
 */
export function BlockRenderer({
  block,
  lessonId,
  checkProgress,
  checkStats,
}: {
  block: Block;
  lessonId?: string;
  checkProgress?: CheckProgress;
  checkStats?: CheckStats;
}) {
  switch (block.type) {
    case "check":
      return lessonId ? (
        <KnowledgeCheck block={toPublicCheck(block)} lessonId={lessonId} progress={checkProgress} stats={checkStats} />
      ) : (
        <KnowledgeCheck block={block} />
      );
    case "text":
      return <Markdown>{block.markdown}</Markdown>;
    case "callout": {
      const style = CALLOUT_STYLES[block.tone];
      return (
        <div className={`my-4 flex gap-3 rounded-xl border p-4 ${style.cls}`}>
          <span className="text-lg">{style.icon}</span>
          <div className="min-w-0 flex-1"><Markdown>{block.markdown}</Markdown></div>
        </div>
      );
    }
    case "image":
      if (!isSafeUrl(block.url)) return null;
      return (
        <figure className="my-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={block.url} alt={block.caption} className="mx-auto max-h-[600px] rounded-xl" loading="lazy" />
          {block.caption && <figcaption className="muted mt-2 text-center text-sm">{block.caption}</figcaption>}
        </figure>
      );
    case "video": {
      if (!isSafeUrl(block.url)) return null;
      const embed = videoEmbedUrl(block.url);
      return (
        <figure className="my-4">
          <div className="aspect-video w-full overflow-hidden rounded-xl bg-black">
            {embed ? (
              <iframe src={embed} className="h-full w-full" allow="accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture; fullscreen" allowFullScreen title={block.caption || "Video"} />
            ) : (
              <video src={block.url} controls className="h-full w-full" playsInline />
            )}
          </div>
          {block.caption && <figcaption className="muted mt-2 text-center text-sm">{block.caption}</figcaption>}
        </figure>
      );
    }
    case "chart":
      return <ChartBlock chartType={block.chartType} data={block.data} title={block.title} />;
    case "embed":
      if (!isSafeUrl(block.url)) return null;
      return (
        <div className="my-4 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
          <iframe src={embedUrl(block.url)} className="w-full" style={{ height: block.height }} allowFullScreen title="Embedded content" sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms allow-presentation" />
        </div>
      );
    case "file":
      if (!isSafeUrl(block.url)) return null;
      return (
        <a href={block.url} target="_blank" rel="noopener noreferrer" className="my-3 flex items-center gap-3 rounded-xl border border-slate-200 p-3 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50">
          <span className="text-2xl">📎</span>
          <span className="font-medium">{block.name}</span>
        </a>
      );
  }
}
