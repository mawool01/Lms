/** What the browser needs to know to upload to Vercel Blob (safe to send to the client). */
export type BlobClientConfig = { mode: "token" | "oidc"; access: "public" | "private" } | null;
