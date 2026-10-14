import { NextResponse } from "next/server";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { authorizeUpload, typeAllowed } from "@/lib/upload-rules";
import { localUploadPath, localUploadsEnabled } from "@/lib/local-files";

/** Development-only upload endpoint used when Vercel Blob isn't configured. */
export async function POST(req: Request) {
  if (!localUploadsEnabled()) return NextResponse.json({ error: "Local uploads are disabled" }, { status: 404 });
  const pathname = new URL(req.url).searchParams.get("pathname") ?? "";
  try {
    const { rule } = await authorizeUpload(pathname);
    const type = (req.headers.get("content-type") ?? "").split(";")[0];
    if (!typeAllowed(type, rule.allowedContentTypes)) return NextResponse.json({ error: `Files of type ${type || "unknown"} aren't allowed here` }, { status: 400 });
    const data = new Uint8Array(await req.arrayBuffer());
    if (data.byteLength > rule.maxBytes) return NextResponse.json({ error: "File is too large" }, { status: 413 });
    const target = localUploadPath(pathname);
    if (!target) return NextResponse.json({ error: "Invalid path" }, { status: 400 });
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, data);
    return NextResponse.json({ pathname });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Upload failed" }, { status: 400 });
  }
}
