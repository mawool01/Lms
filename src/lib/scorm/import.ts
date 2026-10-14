import "server-only";
import { unzipSync } from "fflate";
import { db } from "@/lib/db";
import { parseManifest } from "./manifest";
import { deleteStoredFiles, storageKind, storeFiles } from "./storage";

export const MAX_PACKAGE_BYTES = 500 * 1024 * 1024;
const MAX_UNZIPPED_BYTES = 1024 * 1024 * 1024;

export class ScormImportError extends Error {}

/** Normalizes a zip entry path, rejecting anything that escapes the package root. */
function safePath(name: string) {
  const parts = name.replace(/\\/g, "/").split("/").filter((p) => p && p !== ".");
  if (parts.some((p) => p === "..")) return null;
  return parts.join("/");
}

export async function importScormPackage(opts: {
  zip: Uint8Array;
  courseId: string;
  moduleId: string | null;
  title: string | null;
  gradeMethod: "SCORE" | "COMPLETION";
  weight: number;
  uploadedById: string;
}) {
  const kind = storageKind();
  if (!kind) throw new ScormImportError("SCORM uploads need file storage. Connect a Vercel Blob store to this project (it sets BLOB_READ_WRITE_TOKEN).");
  if (opts.zip.byteLength > MAX_PACKAGE_BYTES) throw new ScormImportError("Package is larger than 500 MB.");

  let entries: Record<string, Uint8Array>;
  try {
    let total = 0;
    entries = unzipSync(opts.zip, {
      filter: (f) => {
        total += f.originalSize;
        if (total > MAX_UNZIPPED_BYTES) throw new ScormImportError("Package is larger than 1 GB when unzipped.");
        return !f.name.endsWith("/");
      },
    });
  } catch (e) {
    if (e instanceof ScormImportError) throw e;
    throw new ScormImportError("That file isn't a valid .zip archive.");
  }

  // Find imsmanifest.xml — normally at the root, but some tools wrap everything in one folder.
  const files: [string, Uint8Array][] = [];
  for (const [name, data] of Object.entries(entries)) {
    const p = safePath(name);
    if (p && !p.startsWith("__MACOSX/")) files.push([p, data]);
  }
  const manifestPath = files
    .map(([p]) => p)
    .filter((p) => p.split("/").pop()!.toLowerCase() === "imsmanifest.xml")
    .sort((a, b) => a.split("/").length - b.split("/").length)[0];
  if (!manifestPath) throw new ScormImportError("No imsmanifest.xml found — is this a SCORM package?");
  const root = manifestPath.includes("/") ? manifestPath.slice(0, manifestPath.lastIndexOf("/") + 1) : "";
  const rooted = files.filter(([p]) => p.startsWith(root)).map(([p, d]) => [p.slice(root.length), d] as [string, Uint8Array]);

  let manifest;
  try {
    manifest = parseManifest(new TextDecoder().decode(entries[Object.keys(entries).find((k) => safePath(k) === manifestPath)!]));
  } catch (e) {
    throw new ScormImportError(`Couldn't read imsmanifest.xml: ${e instanceof Error ? e.message : "invalid XML"}`);
  }
  if (!rooted.some(([p]) => p === manifest.launchPath)) {
    throw new ScormImportError(`The launch file "${manifest.launchPath}" listed in the manifest is missing from the package.`);
  }

  const position = await db.scormPackage.count({ where: { courseId: opts.courseId, moduleId: opts.moduleId } });
  const pkg = await db.scormPackage.create({
    data: {
      courseId: opts.courseId,
      moduleId: opts.moduleId,
      title: opts.title?.trim() || manifest.title || "SCORM package",
      version: manifest.version,
      launchPath: manifest.launchPath,
      launchParams: manifest.launchParams,
      masteryScore: manifest.masteryScore,
      storage: kind,
      storageBase: "",
      fileCount: rooted.length,
      sizeBytes: rooted.reduce((s, [, d]) => s + d.byteLength, 0),
      gradeMethod: opts.gradeMethod,
      weight: opts.weight,
      position,
      uploadedById: opts.uploadedById,
    },
  });
  try {
    const storageBase = await storeFiles(kind, pkg.id, rooted);
    return { pkg: await db.scormPackage.update({ where: { id: pkg.id }, data: { storageBase } }), scoCount: manifest.scoCount };
  } catch (e) {
    await deleteStoredFiles({ id: pkg.id, storage: kind, storageBase: "" }).catch(() => {});
    await db.scormPackage.delete({ where: { id: pkg.id } });
    throw e;
  }
}
