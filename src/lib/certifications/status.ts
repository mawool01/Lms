/** Shared (client + server) helpers for certification status and display. */

export const STATUS_LABELS = {
  DRAFT: { label: "Draft", tone: "gray" },
  SUBMITTED: { label: "Submitted", tone: "brand" },
  UNDER_REVIEW: { label: "Under review", tone: "purple" },
  CHANGES_REQUESTED: { label: "Changes requested", tone: "yellow" },
  APPROVED: { label: "Approved", tone: "green" },
  DENIED: { label: "Not approved", tone: "red" },
  WITHDRAWN: { label: "Withdrawn", tone: "gray" },
} as const;

export const RATING_LABELS = {
  DOES_NOT_MEET: { label: "Does not meet", tone: "red" },
  MEETS: { label: "Meets", tone: "green" },
  EXCEEDS: { label: "Exceeds", tone: "purple" },
} as const;

export const RECOMMENDATION_LABELS = {
  APPROVE: { label: "Approve", tone: "green" },
  REVISE: { label: "Request changes", tone: "yellow" },
  DENY: { label: "Do not approve", tone: "red" },
} as const;

export const EXPIRING_SOON_DAYS = 90;
const DAY = 24 * 3600 * 1000;

export type CertState = "active" | "expiring" | "expired" | "revoked";

export function certState(cert: { expiresAt: Date | null; revokedAt: Date | null }, now = new Date()): CertState {
  if (cert.revokedAt) return "revoked";
  if (!cert.expiresAt) return "active";
  if (cert.expiresAt.getTime() < now.getTime()) return "expired";
  if (cert.expiresAt.getTime() - now.getTime() <= EXPIRING_SOON_DAYS * DAY) return "expiring";
  return "active";
}

export const CERT_STATE_LABELS: Record<CertState, { label: string; tone: "green" | "yellow" | "red" | "gray" }> = {
  active: { label: "Active", tone: "green" },
  expiring: { label: "Expiring soon", tone: "yellow" },
  expired: { label: "Expired", tone: "red" },
  revoked: { label: "Revoked", tone: "gray" },
};

export function daysUntil(date: Date, now = new Date()) {
  return Math.ceil((date.getTime() - now.getTime()) / DAY);
}

export function addMonths(date: Date, months: number) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

/** Expiry date for a newly issued certification (null = lifetime). */
export function expiryFor(
  program: { initialValidityMonths: number; renewalValidityMonths: number },
  level: { lifetime: boolean },
  isRenewal: boolean,
  issuedAt: Date,
) {
  if (level.lifetime) return null;
  return addMonths(issuedAt, isRenewal ? program.renewalValidityMonths : program.initialValidityMonths);
}

/** Readable, unambiguous verification code, e.g. "ICL-7KQ9-M3XP". */
export function newCertCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  const chars = Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
  return `ICL-${chars.slice(0, 4)}-${chars.slice(4)}`;
}

export const normalizeCode = (code: string) => code.trim().toUpperCase().replace(/\s+/g, "");

/** Human-friendly label for an evidence link: uploaded files show their name, other links their site and path. */
export function evidenceName(url: string) {
  try {
    const u = new URL(url);
    const parts = u.pathname.split("/").filter(Boolean).map((p) => decodeURIComponent(p));
    if (u.hostname.endsWith("blob.vercel-storage.com") || parts[0] === "files") return parts.at(-1) ?? url;
    const label = `${u.hostname.replace(/^www\./, "")}${parts.length ? "/" + parts.join("/") : ""}`;
    return label.length > 70 ? `${label.slice(0, 67)}…` : label;
  } catch {
    return url;
  }
}
