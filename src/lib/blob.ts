import "server-only";
import { BlobError, put } from "@vercel/blob";

/**
 * Vercel Blob can be connected two ways:
 *  - "token": older stores set BLOB_READ_WRITE_TOKEN.
 *  - "oidc": newer stores set BLOB_STORE_ID and authenticate with the deployment's
 *    Vercel OIDC token (handled automatically by the SDK).
 * Stores can also be public or private; we try the configured/learned access
 * first and fall back to the other one.
 */
export type BlobMode = "token" | "oidc";
export type BlobAccess = "public" | "private";

export function blobMode(): BlobMode | null {
  if (process.env.BLOB_READ_WRITE_TOKEN) return "token";
  if (process.env.BLOB_STORE_ID) return "oidc";
  return null;
}

const configuredAccess = (): BlobAccess | null =>
  process.env.BLOB_ACCESS === "private" ? "private" : process.env.BLOB_ACCESS === "public" ? "public" : null;

let learnedAccess: BlobAccess | null = null;

/** The access level to try first for this store. */
export function blobAccess(): BlobAccess {
  return configuredAccess() ?? learnedAccess ?? "public";
}

const otherAccess = (a: BlobAccess): BlobAccess => (a === "public" ? "private" : "public");

/** Uploads from the server, retrying with the other access level if the store rejects the first. */
export async function putBlob(pathname: string, body: Buffer, opts: { contentType?: string; allowOverwrite?: boolean }) {
  const first = blobAccess();
  try {
    const result = await put(pathname, body, { ...opts, access: first, addRandomSuffix: false });
    learnedAccess = first;
    return { ...result, access: first };
  } catch (e) {
    if (!(e instanceof BlobError)) throw e;
    const second = otherAccess(first);
    try {
      const result = await put(pathname, body, { ...opts, access: second, addRandomSuffix: false });
      learnedAccess = second;
      return { ...result, access: second };
    } catch {
      throw e;
    }
  }
}

/** Config handed to client components for browser uploads, or null when storage isn't set up. */
export function blobClientConfig(): { mode: BlobMode; access: BlobAccess } | null {
  const mode = blobMode();
  return mode ? { mode, access: blobAccess() } : null;
}

/** Remembers the access level a browser upload succeeded with. */
export function rememberAccess(access: BlobAccess) {
  learnedAccess = access;
}
