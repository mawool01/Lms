import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { del } from "@vercel/blob";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { importScormPackage, MAX_PACKAGE_BYTES, ScormImportError } from "@/lib/scorm/import";

export const maxDuration = 300;

/**
 * Imports a SCORM .zip. Two modes:
 *  - JSON { blobUrl, ... }: the browser already uploaded the zip to Vercel Blob (large files).
 *  - Raw zip body with options in the query string (local development / small files).
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user || user.role === "STUDENT") return NextResponse.json({ error: "Not allowed" }, { status: 403 });

  const url = new URL(req.url);
  let opts: Record<string, string | null>;
  let zip: Uint8Array;
  let blobUrl: string | null = null;

  if (req.headers.get("content-type")?.includes("application/json")) {
    const body = (await req.json()) as Record<string, string | null>;
    opts = body;
    blobUrl = body.blobUrl ?? null;
    let host = "";
    try {
      host = new URL(blobUrl ?? "").hostname;
    } catch {}
    // Only fetch from our own Blob store (prevents server-side request forgery).
    if (!host.endsWith(".public.blob.vercel-storage.com")) return NextResponse.json({ error: "Invalid upload URL" }, { status: 400 });
    const res = await fetch(blobUrl!);
    if (!res.ok) return NextResponse.json({ error: "Couldn't read the uploaded file" }, { status: 400 });
    zip = new Uint8Array(await res.arrayBuffer());
  } else {
    opts = Object.fromEntries(url.searchParams);
    if (Number(req.headers.get("content-length") ?? 0) > MAX_PACKAGE_BYTES) return NextResponse.json({ error: "Package is larger than 500 MB." }, { status: 413 });
    zip = new Uint8Array(await req.arrayBuffer());
  }

  const courseId = opts.courseId ?? "";
  const course = await db.course.findUnique({ where: { id: courseId } });
  if (!course || (user.role !== "ADMIN" && course.teacherId !== user.id)) return NextResponse.json({ error: "Course not found" }, { status: 404 });
  const moduleId = opts.moduleId || null;
  if (moduleId && !(await db.module.findFirst({ where: { id: moduleId, courseId } }))) return NextResponse.json({ error: "Module not found" }, { status: 404 });

  try {
    const { pkg, scoCount } = await importScormPackage({
      zip,
      courseId,
      moduleId,
      title: opts.title ?? null,
      gradeMethod: opts.gradeMethod === "COMPLETION" ? "COMPLETION" : "SCORE",
      weight: Math.max(0, Math.min(1000, Number(opts.weight ?? 20) || 0)),
      uploadedById: user.id,
    });
    revalidatePath(`/courses/${courseId}`, "layout");
    return NextResponse.json({
      id: pkg.id,
      url: `/courses/${courseId}/scorm/${pkg.id}`,
      warning: scoCount > 1 ? `This package has ${scoCount} SCOs; only the first one is launched.` : null,
    });
  } catch (e) {
    if (e instanceof ScormImportError) return NextResponse.json({ error: e.message }, { status: 400 });
    console.error("SCORM import failed", e);
    return NextResponse.json({ error: "Import failed. Please try again." }, { status: 500 });
  } finally {
    if (blobUrl) await del(blobUrl).catch(() => {});
  }
}
