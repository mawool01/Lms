import { NextResponse, type NextRequest } from "next/server";
import { readFile } from "node:fs/promises";
import { get } from "@vercel/blob";
import { SESSION_COOKIE, verifySession } from "@/lib/session";
import { mimeType } from "@/lib/scorm/mime";
import { canReadUpload } from "@/lib/file-access";
import { localUploadPath, localUploadsEnabled } from "@/lib/local-files";

/**
 * Serves privately stored uploads (private Blob stores, or local disk in
 * development): lesson media, assignment submissions and certification evidence.
 * Access rules live in src/lib/file-access.ts.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  const { path } = await params;
  const pathname = path.map((p) => decodeURIComponent(p)).join("/");
  // Only public portfolio attachments can be opened without signing in.
  if (!session && !pathname.startsWith("portfolio/")) return new NextResponse("Unauthorized", { status: 401 });
  if (pathname.split("/").includes("..") || !(await canReadUpload(session?.userId ?? null, pathname))) return new NextResponse("Not found", { status: 404 });

  const headers: Record<string, string> = {
    "Content-Type": mimeType(pathname),
    "Cache-Control": "private, max-age=300",
    "X-Content-Type-Options": "nosniff",
  };
  let body: BodyInit;
  let status = 200;
  if (localUploadsEnabled()) {
    const full = localUploadPath(pathname);
    const data = full ? await readFile(full).catch(() => null) : null;
    if (!data) return new NextResponse("Not found", { status: 404 });
    body = new Uint8Array(data);
    headers["Content-Length"] = String(data.byteLength);
  } else {
    const range = req.headers.get("range");
    const file = await get(pathname, { access: "private", ...(range ? { headers: { Range: range } } : {}) }).catch(() => null);
    if (!file || file.statusCode !== 200) return new NextResponse("Not found", { status: 404 });
    if (file.blob.contentType) headers["Content-Type"] = file.blob.contentType;
    for (const h of ["content-length", "content-range", "accept-ranges", "etag", "last-modified"]) {
      const v = file.headers.get(h);
      if (v) headers[h] = v;
    }
    body = file.stream;
    status = headers["content-range"] ? 206 : 200;
  }
  // Never render uploaded HTML/SVG/XML inline on this site's domain; offer documents as downloads with their name.
  if (/html|svg|xml|javascript/i.test(headers["Content-Type"])) headers["Content-Disposition"] = "attachment";
  else if (!/^(image|video|audio)\/|pdf/.test(headers["Content-Type"])) headers["Content-Disposition"] = `attachment; filename="${pathname.split("/").pop()!.replace(/"/g, "")}"`;
  return new NextResponse(body, { status, headers });
}
