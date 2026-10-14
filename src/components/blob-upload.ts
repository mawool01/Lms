"use client";

import { upload, uploadPresigned } from "@vercel/blob/client";
import type { BlobClientConfig } from "@/lib/blob-config";

export type UploadedFile = { url: string; pathname: string; access: "public" | "private" };

/**
 * Uploads a file straight from the browser to Vercel Blob, working with both
 * token-based and OIDC (store ID) stores, and with public or private stores.
 * Private files are served through this app at /files/… (signed-in users only).
 */
export async function uploadToBlob(
  file: File,
  folder: "uploads" | "scorm-uploads" | "cert-evidence" | "submissions" | "portfolio",
  config: NonNullable<BlobClientConfig>,
  onProgress?: (percent: number) => void,
  /** Required for per-user folders (submissions, cert-evidence): the uploader's user id. */
  ownerId?: string,
): Promise<UploadedFile> {
  const safeName = file.name.replace(/[^\w.\-]+/g, "_") || "file";
  const pathname = `${folder}/${ownerId ? `${ownerId}/` : ""}${crypto.randomUUID()}/${safeName}`;
  if (config.mode === "local") return uploadLocally(pathname, file, onProgress);
  const attempt = (access: "public" | "private") => {
    const common = {
      access,
      handleUploadUrl: "/api/upload",
      contentType: file.type || undefined,
      onUploadProgress: onProgress ? (p: { percentage: number }) => onProgress(Math.round(p.percentage)) : undefined,
    };
    return config.mode === "token"
      ? upload(pathname, file, { ...common, multipart: file.size > 50 * 1024 * 1024 })
      : uploadPresigned(pathname, file, common);
  };

  let access = config.access;
  let blob;
  try {
    blob = await attempt(access);
  } catch (first) {
    // The store may be the other access type (public vs private): retry once.
    access = access === "public" ? "private" : "public";
    try {
      blob = await attempt(access);
    } catch {
      throw first;
    }
  }
  const url = access === "private" ? `${window.location.origin}/files/${blob.pathname}` : blob.url;
  return { url, pathname: blob.pathname, access };
}

/** Development fallback: send the file to this app, which saves it under ./.data/uploads. */
async function uploadLocally(pathname: string, file: File, onProgress?: (percent: number) => void): Promise<UploadedFile> {
  onProgress?.(0);
  const res = await fetch(`/api/upload/local?pathname=${encodeURIComponent(pathname)}`, {
    method: "POST",
    headers: { "Content-Type": file.type || "application/octet-stream" },
    body: file,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? "Upload failed");
  onProgress?.(100);
  return { url: `${window.location.origin}/files/${pathname}`, pathname, access: "private" };
}
