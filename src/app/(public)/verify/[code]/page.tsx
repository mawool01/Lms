import Link from "next/link";
import { getBranding } from "@/lib/branding";
import { db } from "@/lib/db";
import { CERT_STATE_LABELS, certState, normalizeCode } from "@/lib/certifications/status";
import { formatDate } from "@/lib/utils";
import { Card } from "@/components/ui";

export const metadata = { title: "Certificate verification" };

export default async function VerifyCodePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const org = (await getBranding()).shortName;
  const cert = await db.certification.findUnique({
    where: { code: normalizeCode(decodeURIComponent(code)) },
    include: { program: { select: { name: true, kind: true } }, level: { select: { name: true } } },
  });

  if (!cert) {
    return (
      <div className="mx-auto max-w-lg text-center">
        <p className="text-5xl">❓</p>
        <h1 className="mt-3 text-2xl font-bold">Certificate not found</h1>
        <p className="muted mt-2">No {org} certificate matches <span className="font-mono">{decodeURIComponent(code)}</span>. Check the code and try again.</p>
        <Link href="/verify" className="btn-primary mt-4">Try another code</Link>
      </div>
    );
  }
  const state = certState(cert);
  const valid = state === "active" || state === "expiring";
  return (
    <div className="mx-auto max-w-xl">
      <Card className={valid ? "border-emerald-300 dark:border-emerald-800" : "border-red-300 dark:border-red-900"}>
        <div className="text-center">
          <p className="text-5xl">{valid ? "✅" : state === "revoked" ? "⛔" : "⌛"}</p>
          <h1 className="mt-2 text-2xl font-bold">{valid ? "Valid certification" : state === "revoked" ? "Certification revoked" : "Certification expired"}</h1>
          <p className="muted font-mono text-sm">{cert.code}</p>
        </div>
        <dl className="mt-6 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
          {cert.program.kind === "CENTER" ? (
            <>
              <dt className="muted">Center</dt><dd className="font-semibold">{cert.centerName}</dd>
              <dt className="muted">Institution</dt><dd>{cert.institution ?? "—"}</dd>
              <dt className="muted">Director</dt><dd>{cert.holderName}</dd>
            </>
          ) : (
            <>
              <dt className="muted">Name</dt><dd className="font-semibold">{cert.holderName}</dd>
              {cert.institution && (<><dt className="muted">Institution</dt><dd>{cert.institution}</dd></>)}
            </>
          )}
          <dt className="muted">Certification</dt><dd>{cert.program.name}</dd>
          <dt className="muted">Level</dt><dd>{cert.level.name}</dd>
          <dt className="muted">Issued</dt><dd>{formatDate(cert.issuedAt)}</dd>
          <dt className="muted">{state === "expired" ? "Expired" : "Valid until"}</dt><dd>{cert.expiresAt ? formatDate(cert.expiresAt) : "Lifetime"}</dd>
          <dt className="muted">Status</dt><dd className="font-semibold">{CERT_STATE_LABELS[state].label}</dd>
        </dl>
      </Card>
      <p className="muted mt-4 text-center text-xs">Verified by the {org} certification registry on {formatDate(new Date())}.</p>
    </div>
  );
}
