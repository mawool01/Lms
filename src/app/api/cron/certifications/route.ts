import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { appUrl, emailEnabled, sendEmail } from "@/lib/certifications/email";
import { daysUntil } from "@/lib/certifications/status";
import { formatDate } from "@/lib/utils";

/** Reminder thresholds in days before expiry; 0 = "has expired" notice. */
const STAGES = [90, 30, 7, 0];

/**
 * Daily job (Vercel Cron, see vercel.json): emails holders before their
 * certification expires and once when it lapses. Each stage is sent once.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const now = new Date();
  const horizon = new Date(now.getTime() + STAGES[0] * 86400000);
  const certs = await db.certification.findMany({
    where: { revokedAt: null, expiresAt: { not: null, lte: horizon, gte: new Date(now.getTime() - 30 * 86400000) } },
    include: { program: true, level: true, holder: { select: { email: true, name: true, active: true } } },
  });

  let sent = 0;
  for (const cert of certs) {
    const days = daysUntil(cert.expiresAt!, now);
    // The smallest threshold we've reached, e.g. 30 when 12 days remain.
    const stage = STAGES.filter((s) => (s === 0 ? days <= 0 : days <= s)).at(-1);
    if (stage === undefined) continue;
    // reminderStage stores the last stage sent, offset by 1 so 0 can mean "nothing sent".
    const sentStage = cert.reminderStage === 0 ? Infinity : cert.reminderStage - 1;
    if (stage >= sentStage) continue;
    // Already renewed? Then a newer certification in the same program supersedes this one.
    const renewed = await db.certification.findFirst({
      where: {
        id: { not: cert.id },
        programId: cert.programId,
        revokedAt: null,
        issuedAt: { gt: cert.issuedAt },
        OR: [cert.holderId ? { holderId: cert.holderId } : { holderEmail: cert.holderEmail ?? "__none__" }],
      },
    });
    if (renewed) {
      await db.certification.update({ where: { id: cert.id }, data: { reminderStage: 1 } });
      continue;
    }

    const to = cert.holder?.active ? cert.holder.email : cert.holderEmail;
    if (to) {
      const what = `${cert.program.name} — ${cert.level.name}${cert.centerName ? ` (${cert.centerName})` : ""}`;
      const ok = await sendEmail(
        to,
        stage === 0 ? `Your ICLCA certification has expired` : `Your ICLCA certification expires in ${days} days`,
        [
          `Hi ${cert.holder?.name ?? cert.holderName},`,
          stage === 0
            ? `Your ${what} expired on ${formatDate(cert.expiresAt)}. You can apply to renew it at any time.`
            : `Your ${what} expires on ${formatDate(cert.expiresAt)}. Start your renewal now so there's no gap in your certification.`,
        ],
        { href: appUrl("/certifications"), label: "Renew my certification" },
      );
      if (ok) sent++;
    }
    await db.certification.update({ where: { id: cert.id }, data: { reminderStage: stage + 1 } });
  }
  return NextResponse.json({ checked: certs.length, emailsSent: sent, emailEnabled: emailEnabled() });
}
