import "server-only";
import { getCurrentUser } from "@/lib/auth";

/** Office documents, PDFs, text, images, audio/video and archives. */
const DOCUMENT_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.*",
  "application/vnd.ms-*",
  "application/vnd.oasis.opendocument.*",
  "application/rtf",
  "application/zip",
  "application/x-zip-compressed",
  "text/*",
  "image/*",
  "audio/*",
  "video/*",
];
const ANY_TYPES = ["image/*", "video/*", "audio/*", "application/*", "text/*"];
const MB = 1024 * 1024;

/** owned = path includes the uploader's id ("folder/<userId>/<uuid>/<name>") so access can be checked. */
type Rule = { staffOnly: boolean; owned: boolean; maxBytes: number; allowedContentTypes: string[] };

/** What each browser-upload folder accepts, and from whom. */
export const UPLOAD_RULES: Record<string, Rule> = {
  "uploads/": { staffOnly: true, owned: false, maxBytes: 500 * MB, allowedContentTypes: ANY_TYPES }, // lesson media
  "scorm-uploads/": { staffOnly: true, owned: false, maxBytes: 500 * MB, allowedContentTypes: ANY_TYPES },
  "cert-evidence/": { staffOnly: false, owned: true, maxBytes: 100 * MB, allowedContentTypes: DOCUMENT_TYPES },
  "branding/": { staffOnly: true, owned: false, maxBytes: 5 * MB, allowedContentTypes: ["image/png", "image/jpeg", "image/svg+xml", "image/webp", "image/x-icon", "image/vnd.microsoft.icon", "image/gif"] },
  "portfolio/": { staffOnly: false, owned: true, maxBytes: 100 * MB, allowedContentTypes: DOCUMENT_TYPES },
  "submissions/": { staffOnly: false, owned: true, maxBytes: 100 * MB, allowedContentTypes: DOCUMENT_TYPES },
};

export const UPLOAD_FOLDERS = Object.keys(UPLOAD_RULES).map((p) => p.slice(0, -1));

/** Checks the signed-in user may upload to this path; throws with a readable message otherwise. */
export async function authorizeUpload(pathname: string) {
  const prefix = Object.keys(UPLOAD_RULES).find((p) => pathname.startsWith(p));
  if (!prefix || pathname.includes("..")) throw new Error("Invalid upload path");
  const rule = UPLOAD_RULES[prefix];
  const user = await getCurrentUser();
  if (!user) throw new Error("Please sign in to upload files");
  const parts = pathname.split("/");
  if (parts.length !== (rule.owned ? 4 : 3) || (rule.owned && parts[1] !== user.id)) throw new Error("Invalid upload path");
  if (rule.staffOnly && user.role === "STUDENT") throw new Error("Only teachers and admins can upload here");
  return { user, rule };
}

/** Matches a MIME type against patterns like "image/*" or "application/vnd.ms-*". */
export function typeAllowed(type: string, patterns: string[]) {
  return patterns.some((p) => (p.endsWith("*") ? type.startsWith(p.slice(0, -1)) : type === p));
}
