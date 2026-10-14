import Link from "next/link";
import { db } from "@/lib/db";
import type { CurrentUser } from "@/lib/auth";
import { EXPIRING_SOON_DAYS, daysUntil } from "@/lib/certifications/status";

/** Certification nudges shown at the top of the dashboard. */
export async function CertDashboardAlerts({ user }: { user: CurrentUser }) {
  const now = new Date();
  const soon = new Date(now.getTime() + EXPIRING_SOON_DAYS * 86400000);
  const [expiring, reviews, needsAction, changes] = await Promise.all([
    db.certification.findMany({
      where: { holderId: user.id, revokedAt: null, expiresAt: { not: null, lte: soon, gte: new Date(now.getTime() - 365 * 86400000) } },
      include: { program: { select: { name: true } }, level: { select: { name: true } } },
    }),
    db.certReview.count({ where: { reviewerId: user.id, submittedAt: null, application: { status: { in: ["SUBMITTED", "UNDER_REVIEW"] } } } }),
    user.role === "ADMIN" ? db.certApplication.count({ where: { status: "SUBMITTED" } }) : Promise.resolve(0),
    db.certApplication.count({ where: { applicantId: user.id, status: "CHANGES_REQUESTED" } }),
  ]);
  // Hide expiry warnings for certifications already being renewed or superseded.
  const renewing = new Set(
    (await db.certApplication.findMany({
      where: { applicantId: user.id, renewsCertificationId: { in: expiring.map((c) => c.id) }, status: { notIn: ["DENIED", "WITHDRAWN"] } },
      select: { renewsCertificationId: true },
    })).map((a) => a.renewsCertificationId),
  );
  const alerts = expiring.filter((c) => !renewing.has(c.id));
  if (!alerts.length && !reviews && !needsAction && !changes) return null;

  const box = "mb-4 flex flex-col gap-2 rounded-2xl border p-4 sm:flex-row sm:items-center";
  return (
    <div className="mb-2">
      {alerts.map((c) => {
        const days = daysUntil(c.expiresAt!);
        return (
          <div key={c.id} className={`${box} ${days < 0 ? "border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950/30" : "border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30"}`}>
            <span className="text-2xl">🎖️</span>
            <p className="flex-1 text-sm">
              Your <b>{c.program.name} — {c.level.name}</b> {days < 0 ? `expired ${-days} days ago` : `expires in ${days} day${days === 1 ? "" : "s"}`}.
            </p>
            <Link href="/certifications" className="btn-primary btn-sm">Renew</Link>
          </div>
        );
      })}
      {changes > 0 && (
        <div className={`${box} border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30`}>
          <span className="text-2xl">✏️</span>
          <p className="flex-1 text-sm">The review committee asked for changes on your certification application.</p>
          <Link href="/certifications" className="btn-primary btn-sm">Update application</Link>
        </div>
      )}
      {reviews > 0 && (
        <div className={`${box} border-brand-200 bg-brand-50 dark:border-brand-900 dark:bg-brand-950/30`}>
          <span className="text-2xl">📝</span>
          <p className="flex-1 text-sm">You have {reviews} certification application{reviews === 1 ? "" : "s"} to review.</p>
          <Link href="/certifications/review" className="btn-primary btn-sm">Start reviewing</Link>
        </div>
      )}
      {needsAction > 0 && (
        <div className={`${box} border-brand-200 bg-brand-50 dark:border-brand-900 dark:bg-brand-950/30`}>
          <span className="text-2xl">📥</span>
          <p className="flex-1 text-sm">{needsAction} new certification application{needsAction === 1 ? " needs" : "s need"} reviewers assigned.</p>
          <Link href="/admin/certifications" className="btn-primary btn-sm">Open</Link>
        </div>
      )}
    </div>
  );
}
