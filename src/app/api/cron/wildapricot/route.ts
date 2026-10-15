import { NextResponse } from "next/server";
import { syncWaEnrollments, waSyncSummary } from "@/lib/wildapricot-sync";

// Paging registrations for every linked event can take a while.
export const maxDuration = 300;

/**
 * Daily job (Vercel Cron, see vercel.json): enrolls Wild Apricot event
 * registrants in the courses those events are linked to, and removes access
 * the sync itself granted when a registration disappears.
 *
 * Add ?dryRun=1 to see what it would do without writing anything.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const dryRun = new URL(req.url).searchParams.get("dryRun") === "1";
  const result = await syncWaEnrollments({ trigger: "CRON", dryRun });
  return NextResponse.json({
    ok: result.ok,
    dryRun: result.dryRun,
    summary: waSyncSummary(result),
    links: result.links,
    linksFailed: result.linksFailed,
    registrations: result.registrations,
    enrolled: result.enrolled.length,
    revoked: result.revoked.length,
    unmatched: result.unmatched.length,
    skippedRevocation: result.skippedRevocation,
    errors: result.errors,
  });
}
