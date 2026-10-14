import "server-only";
import path from "node:path";

/** Root for uploads stored on disk in local development. */
export const LOCAL_UPLOAD_ROOT = path.join(process.cwd(), ".data", "uploads");

/** Resolves an upload pathname inside the local root, or null if it would escape it. */
export function localUploadPath(pathname: string) {
  const full = path.join(LOCAL_UPLOAD_ROOT, pathname);
  return full.startsWith(LOCAL_UPLOAD_ROOT + path.sep) ? full : null;
}

export const localUploadsEnabled = () => !process.env.VERCEL && !process.env.BLOB_READ_WRITE_TOKEN && !process.env.BLOB_STORE_ID;
