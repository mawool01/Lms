import { z } from "zod";

/** Lesson content is stored as an ordered list of typed blocks. */
export const blockSchema = z.discriminatedUnion("type", [
  z.object({ id: z.string(), type: z.literal("text"), markdown: z.string() }),
  z.object({ id: z.string(), type: z.literal("image"), url: z.string(), caption: z.string().default("") }),
  z.object({ id: z.string(), type: z.literal("video"), url: z.string(), caption: z.string().default("") }),
  z.object({
    id: z.string(),
    type: z.literal("chart"),
    chartType: z.enum(["bar", "line", "pie", "area"]),
    title: z.string().default(""),
    // CSV-like data: first row = header (label, series1, series2, ...)
    data: z.string(),
  }),
  z.object({ id: z.string(), type: z.literal("embed"), url: z.string(), height: z.number().default(480) }),
  z.object({ id: z.string(), type: z.literal("file"), url: z.string(), name: z.string().default("Download") }),
  z.object({ id: z.string(), type: z.literal("callout"), tone: z.enum(["info", "tip", "warning"]), markdown: z.string() }),
]);

export type Block = z.infer<typeof blockSchema>;
export type BlockType = Block["type"];
export const blocksSchema = z.array(blockSchema);

export function parseBlocks(value: unknown): Block[] {
  const result = blocksSchema.safeParse(value);
  return result.success ? result.data : [];
}

export const BLOCK_LABELS: Record<BlockType, string> = {
  text: "Text",
  image: "Image",
  video: "Video",
  chart: "Chart / Graph",
  embed: "Embed",
  file: "File / Link",
  callout: "Callout",
};

/** Parses chart CSV text into recharts rows + series names. */
export function parseChartData(csv: string) {
  const lines = csv
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => l.split(",").map((c) => c.trim()));
  if (lines.length < 2) return { rows: [], series: [] as string[], labelKey: "label" };
  const [header, ...body] = lines;
  const labelKey = header[0] || "label";
  const series = header.slice(1);
  const rows = body.map((cells) => {
    const row: Record<string, string | number> = { [labelKey]: cells[0] ?? "" };
    series.forEach((s, i) => {
      const n = Number(cells[i + 1]);
      row[s] = Number.isFinite(n) ? n : 0;
    });
    return row;
  });
  return { rows, series, labelKey };
}

/** Turns YouTube / Vimeo / Loom links into embeddable URLs. Returns null for direct video files. */
export function videoEmbedUrl(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    if (host === "youtube.com" || host === "m.youtube.com") {
      const id = u.searchParams.get("v") ?? u.pathname.split("/").filter(Boolean).pop();
      if (u.pathname.startsWith("/embed/")) return url;
      return id ? `https://www.youtube-nocookie.com/embed/${id}` : null;
    }
    if (host === "youtu.be") return `https://www.youtube-nocookie.com/embed/${u.pathname.slice(1)}`;
    if (host === "vimeo.com") return `https://player.vimeo.com/video/${u.pathname.split("/").filter(Boolean)[0]}`;
    if (host === "player.vimeo.com") return url;
    if (host === "loom.com") return url.replace("/share/", "/embed/");
    if (/\.(mp4|webm|ogg|mov)(\?|$)/i.test(u.pathname)) return null;
    return url;
  } catch {
    return null;
  }
}

/** Only http(s) URLs are allowed in user-supplied content. */
export function isSafeUrl(url: string) {
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

/**
 * Converts share/edit links from services that refuse to be framed into their
 * embeddable form (e.g. Google Slides ".../edit" → ".../embed"). Other URLs pass through.
 */
export function embedUrl(url: string): string {
  let u: URL;
  try {
    u = new URL(url.trim());
  } catch {
    return url;
  }
  const host = u.hostname.replace(/^www\./, "");

  if (host === "docs.google.com") {
    // Already published to the web ("/pub", "/pubhtml") or an embed link: keep, but make sure Slides use /embed.
    const published = /\/d\/e\/([^/]+)/.exec(u.pathname);
    if (published) {
      const id = published[1];
      if (u.pathname.startsWith("/presentation/")) {
        // Keep the publisher's settings (start, loop, delayms); default to not auto-starting.
        const params = new URLSearchParams(u.search);
        if (!params.has("start")) params.set("start", "false");
        return `https://docs.google.com/presentation/d/e/${id}/embed?${params}`;
      }
      if (u.pathname.startsWith("/forms/")) return `https://docs.google.com/forms/d/e/${id}/viewform?embedded=true`;
      if (u.pathname.startsWith("/spreadsheets/")) return `https://docs.google.com/spreadsheets/d/e/${id}/pubhtml?widget=true&headers=false`;
      if (u.pathname.startsWith("/document/")) return `https://docs.google.com/document/d/e/${id}/pub?embedded=true`;
      return url;
    }
    const m = /^\/(presentation|document|spreadsheets|forms|drawings)\/d\/([^/]+)/.exec(u.pathname);
    if (m) {
      const [, kind, id] = m;
      if (kind === "presentation") return `https://docs.google.com/presentation/d/${id}/embed?start=false&loop=false`;
      if (kind === "forms") return `https://docs.google.com/forms/d/${id}/viewform?embedded=true`;
      if (kind === "drawings") return `https://docs.google.com/drawings/d/${id}/preview`;
      const gid = u.hash.match(/gid=(\d+)/)?.[1] ?? u.searchParams.get("gid");
      return `https://docs.google.com/${kind}/d/${id}/preview${kind === "spreadsheets" && gid ? `?gid=${gid}` : ""}`;
    }
  }
  if (host === "drive.google.com") {
    const id = /\/file\/d\/([^/]+)/.exec(u.pathname)?.[1] ?? u.searchParams.get("id");
    if (id) return `https://drive.google.com/file/d/${id}/preview`;
  }
  if (host === "canva.com") {
    // Canva share links embed with ?embed
    if (/\/design\//.test(u.pathname) && !u.searchParams.has("embed")) {
      u.pathname = u.pathname.replace(/\/(edit|view)\/?$/, "/view");
      u.searchParams.set("embed", "");
      return u.toString().replace("embed=", "embed");
    }
  }
  return url;
}
