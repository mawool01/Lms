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
  folder: "uploads" | "scorm-uploads",
  config: NonNullable<BlobClientConfig>,
  onProgress?: (percent: number) => void,
): Promise<UploadedFile> {
  const safeName = file.name.replace(/[^\w.\-]+/g, "_") || "file";
  const pathname = `${folder}/${crypto.randomUUID()}/${safeName}`;
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
