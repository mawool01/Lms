/**
 * What the browser needs to know to upload files (safe to send to the client).
 * "local" = development without Vercel Blob: files go to ./.data/uploads.
 */
export type BlobClientConfig = { mode: "token" | "oidc" | "local"; access: "public" | "private" } | null;
