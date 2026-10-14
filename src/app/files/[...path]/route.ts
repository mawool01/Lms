import { NextResponse, type NextRequest } from "next/server";
import { get } from "@vercel/blob";
import { SESSION_COOKIE, verifySession } from "@/lib/session";
import { mimeType } from "@/lib/scorm/mime";

/**
 * Serves files uploaded from the lesson editor when the Blob store is private.
 * Only signed-in users can view them, and only files in the uploads/ folder.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  if (!session) return new NextResponse("Unauthorized", { status: 401 });
  const { path } = await params;
  const pathname = path.map((p) => decodeURIComponent(p)).join("/");
  if (!(pathname.startsWith("uploads/") || pathname.startsWith("cert-evidence/")) || pathname.split("/").includes("..")) return new NextResponse("Not found", { status: 404 });

  const range = req.headers.get("range");
  const file = await get(pathname, { access: "private", ...(range ? { headers: { Range: range } } : {}) }).catch(() => null);
  if (!file || file.statusCode !== 200) return new NextResponse("Not found", { status: 404 });

  const headers: Record<string, string> = {
    "Content-Type": file.blob.contentType || mimeType(pathname),
    "Cache-Control": "private, max-age=3600",
    "X-Content-Type-Options": "nosniff",
  };
  // Never render uploaded HTML/SVG/XML inline on this site's domain.
  if (/html|svg|xml|javascript/i.test(headers["Content-Type"])) headers["Content-Disposition"] = "attachment";
  for (const h of ["content-length", "content-range", "accept-ranges", "etag", "last-modified"]) {
    const v = file.headers.get(h);
    if (v) headers[h] = v;
  }
  return new NextResponse(file.stream, { status: headers["content-range"] ? 206 : 200, headers });
}
