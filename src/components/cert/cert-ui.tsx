import Link from "next/link";
import { Pill } from "@/components/ui";
import { CERT_STATE_LABELS, STATUS_LABELS, certState, daysUntil } from "@/lib/certifications/status";
import { formatDate } from "@/lib/utils";

export function AppStatusPill({ status }: { status: keyof typeof STATUS_LABELS }) {
  const s = STATUS_LABELS[status];
  return <Pill tone={s.tone}>{s.label}</Pill>;
}

export function CertStatePill({ cert }: { cert: { expiresAt: Date | null; revokedAt: Date | null } }) {
  const s = CERT_STATE_LABELS[certState(cert)];
  return <Pill tone={s.tone}>{s.label}</Pill>;
}

export function expiryText(cert: { expiresAt: Date | null; revokedAt: Date | null }) {
  if (cert.revokedAt) return `Revoked ${formatDate(cert.revokedAt)}`;
  if (!cert.expiresAt) return "Lifetime — does not expire";
  const days = daysUntil(cert.expiresAt);
  if (days < 0) return `Expired ${formatDate(cert.expiresAt)}`;
  return `Valid until ${formatDate(cert.expiresAt)}${days <= 90 ? ` (${days} day${days === 1 ? "" : "s"} left)` : ""}`;
}

/** Steps shown to applicants so they know where their application is. */
export function StatusTimeline({ status }: { status: keyof typeof STATUS_LABELS }) {
  const steps = ["DRAFT", "SUBMITTED", "UNDER_REVIEW", "DECISION"] as const;
  const labels = { DRAFT: "Draft", SUBMITTED: "Submitted", UNDER_REVIEW: "Committee review", DECISION: "Decision" };
  const index =
    status === "DRAFT" ? 0 : status === "SUBMITTED" ? 1 : status === "UNDER_REVIEW" || status === "CHANGES_REQUESTED" ? 2 : 3;
  return (
    <ol className="flex items-center gap-2 text-xs">
      {steps.map((s, i) => (
        <li key={s} className="flex items-center gap-2">
          <span className={`flex h-6 w-6 items-center justify-center rounded-full font-semibold ${i <= index ? "bg-brand-600 text-white" : "bg-slate-200 text-slate-500 dark:bg-slate-800"}`}>
            {i < index ? "✓" : i + 1}
          </span>
          <span className={i <= index ? "font-medium" : "muted"}>{labels[s]}</span>
          {i < steps.length - 1 && <span className="muted">—</span>}
        </li>
      ))}
    </ol>
  );
}

export function VerifyLink({ code }: { code: string }) {
  return (
    <Link href={`/verify/${code}`} className="font-mono text-xs hover:underline">
      {code}
    </Link>
  );
}
