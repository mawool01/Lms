import "server-only";
import { mkdir, readFile, rm, writeFile, stat } from "node:fs/promises";
import path from "node:path";
import { del, list, put } from "@vercel/blob";
import { mimeType } from "./mime";

/**
 * SCORM files live in Vercel Blob in production. Without a Blob token (local
 * development) they're written to ./.data/scorm on disk.
 */
export type StorageKind = "blob" | "local";

export function storageKind(): StorageKind | null {
  if (process.env.BLOB_READ_WRITE_TOKEN) return "blob";
  if (process.env.VERCEL) return null; // Vercel's filesystem is read-only: Blob is required.
  return "local";
}

const LOCAL_ROOT = path.join(process.cwd(), ".data", "scorm");

export const localDir = (packageId: string) => path.join(LOCAL_ROOT, packageId);

const encodePath = (p: string) => p.split("/").map(encodeURIComponent).join("/");

/** Uploads all files with limited concurrency. Returns the storage base for later reads. */
export async function storeFiles(kind: StorageKind, packageId: string, files: [string, Uint8Array][]): Promise<string> {
  if (kind === "local") {
    const dir = localDir(packageId);
    for (const [name, data] of files) {
      const target = path.join(dir, name);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, data);
    }
    return dir;
  }
  let base = "";
  const queue = [...files];
  const worker = async () => {
    for (let next = queue.shift(); next; next = queue.shift()) {
      const [name, data] = next;
      const pathname = `scorm/${packageId}/${name}`;
      const blob = await put(pathname, Buffer.from(data), {
        access: "public",
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: mimeType(name),
      });
      if (!base) base = blob.url.slice(0, blob.url.indexOf("/scorm/"));
    }
  };
  await Promise.all(Array.from({ length: 8 }, worker));
  return base;
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
  const res = await fetch(`${pkg.storageBase}/scorm/${pkg.id}/${encodePath(filePath)}`, { headers: range ? { Range: range } : {} });
  if (!res.ok || !res.body) return null;
  const headers: Record<string, string> = {};
  for (const h of ["content-length", "content-range", "accept-ranges", "etag", "last-modified"]) {
    const v = res.headers.get(h);
    if (v) headers[h] = v;
  }
  return { status: res.status, body: res.body, headers };
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
