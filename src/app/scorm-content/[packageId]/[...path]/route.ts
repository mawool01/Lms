import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/session";
import { cachedContentAccess } from "@/lib/scorm/access";
import { readStoredFile } from "@/lib/scorm/storage";
import { mimeType } from "@/lib/scorm/mime";

/**
 * Serves SCORM package files from this app's own origin. Content must be
 * same-origin with the player page so it can find window.API / API_1484_11.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ packageId: string; path: string[] }> }) {
  const { packageId, path } = await params;
  const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  if (!session) return new NextResponse("Unauthorized", { status: 401 });
  const pkg = await cachedContentAccess(session.userId, packageId);
  if (!pkg) return new NextResponse("Not found", { status: 404 });

  const filePath = path.map((p) => decodeURIComponent(p)).join("/");
  if (filePath.split("/").includes("..")) return new NextResponse("Not found", { status: 404 });
  const file = await readStoredFile(pkg, filePath, req.headers.get("range"));
  if (!file) return new NextResponse("Not found", { status: 404 });

  return new NextResponse(file.body, {
    status: file.status,
    headers: {
      ...file.headers,
      "Content-Type": mimeType(filePath),
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
