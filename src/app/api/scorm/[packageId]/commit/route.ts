import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/session";
import { packageAccess } from "@/lib/scorm/access";
import { saveCmi } from "@/lib/scorm/tracking";

/** Receives LMSCommit / Commit / Terminate calls from the SCORM player (also via sendBeacon). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ packageId: string }> }) {
  const { packageId } = await params;
  const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const access = await packageAccess(session.userId, packageId);
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });
  // Instructors launching a package are previewing it: nothing is recorded.
  if (!access.isEnrolled) return NextResponse.json({ ok: true, recorded: false });

  let body: { cmi?: Record<string, unknown>; finish?: boolean };
  try {
    body = JSON.parse(await req.text());
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.cmi || typeof body.cmi !== "object") return NextResponse.json({ error: "Missing cmi" }, { status: 400 });
  try {
    const attempt = await saveCmi(access.pkg, session.userId, body.cmi, !!body.finish);
    return NextResponse.json({ ok: true, recorded: true, completionStatus: attempt.completionStatus, successStatus: attempt.successStatus, percent: attempt.percent });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Save failed" }, { status: 400 });
  }
}
