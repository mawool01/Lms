import "server-only";
import { mkdir, readFile, rm, writeFile, stat } from "node:fs/promises";
import path from "node:path";
import { del, get, list } from "@vercel/blob";
import { blobMode, putBlob, type BlobAccess } from "@/lib/blob";
import { mimeType } from "./mime";

/**
 * SCORM files live in Vercel Blob in production. Without Blob configured (local
 * development) they're written to ./.data/scorm on disk.
 *
 * Stored kinds: "blob" (public store), "blob-private" (private store), "local".
 */
export type StorageKind = "blob" | "local";

export function storageKind(): StorageKind | null {
  if (blobMode()) return "blob";
  if (process.env.VERCEL) return null; // Vercel's filesystem is read-only: Blob is required.
  return "local";
}

const LOCAL_ROOT = path.join(process.cwd(), ".data", "scorm");

export const localDir = (packageId: string) => path.join(LOCAL_ROOT, packageId);

const blobAccessOf = (storage: string): BlobAccess => (storage === "blob-private" ? "private" : "public");

/** Uploads all files with limited concurrency. Returns the storage kind to record for later reads. */
export async function storeFiles(kind: StorageKind, packageId: string, files: [string, Uint8Array][]): Promise<{ storage: string; storageBase: string }> {
  if (kind === "local") {
    const dir = localDir(packageId);
    for (const [name, data] of files) {
      const target = path.join(dir, name);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, data);
    }
    return { storage: "local", storageBase: dir };
  }

  const queue = [...files];
  // Upload one file first so the store's access level (public/private) is known before fanning out.
  const [firstName, firstData] = queue.shift()!;
  const first = await putBlob(`scorm/${packageId}/${firstName}`, Buffer.from(firstData), { contentType: mimeType(firstName), allowOverwrite: true });
  const worker = async () => {
    for (let next = queue.shift(); next; next = queue.shift()) {
      const [name, data] = next;
      await putBlob(`scorm/${packageId}/${name}`, Buffer.from(data), { contentType: mimeType(name), allowOverwrite: true });
    }
  };
  await Promise.all(Array.from({ length: 8 }, worker));
  return { storage: first.access === "private" ? "blob-private" : "blob", storageBase: first.url.slice(0, first.url.indexOf("/scorm/")) };
}

/** Fetches one file. Supports HTTP range requests for media on Blob storage. */
export async function readStoredFile(
  pkg: { id: string; storage: string; storageBase: string },
  filePath: string,
  range: string | null,
): Promise<{ status: number; body: BodyInit; headers: Record<string, string> } | null> {
  if (pkg.storage === "local") {
    const dir = localDir(pkg.id);
    const full = path.join(dir, filePath);
    if (!full.startsWith(dir + path.sep)) return null;
    try {
      if (!(await stat(full)).isFile()) return null;
      const data = await readFile(full);
      return { status: 200, body: new Uint8Array(data), headers: { "Content-Length": String(data.byteLength) } };
    } catch {
      return null;
    }
  }
  // The SDK authenticates (token or OIDC) and works for both public and private stores.
  const result = await get(`scorm/${pkg.id}/${filePath}`, {
    access: blobAccessOf(pkg.storage),
    ...(range ? { headers: { Range: range } } : {}),
  }).catch(() => null);
  if (!result || result.statusCode !== 200) return null;
  const headers: Record<string, string> = {};
  for (const h of ["content-length", "content-range", "accept-ranges", "etag", "last-modified"]) {
    const v = result.headers.get(h);
    if (v) headers[h] = v;
  }
  return { status: headers["content-range"] ? 206 : 200, body: result.stream, headers };
}

export async function deleteStoredFiles(pkg: { id: string; storage: string; storageBase: string }) {
  if (pkg.storage === "local") {
    // Always derive the directory from the id so a bad storageBase can never delete anything else.
    await rm(localDir(pkg.id), { recursive: true, force: true });
    return;
  }
  let cursor: string | undefined;
  do {
    const page = await list({ prefix: `scorm/${pkg.id}/`, cursor, limit: 1000 });
    if (page.blobs.length) await del(page.blobs.map((b) => b.url));
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
}
