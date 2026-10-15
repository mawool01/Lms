import "server-only";
import type { WaSyncTrigger } from "@prisma/client";
import { db } from "./db";
import { WaApiError, waAdminEnabled } from "./wildapricot";
import { type WaRegistration, waListContactRegistrations, waListEventRegistrations } from "./wildapricot-admin";
import { REVOKE_GRACE_DAYS, computeRevocations, isEligibleRegistration, isInRevokeWindow } from "./wildapricot-rules";

export * from "./wildapricot-rules";

/**
 * Turns Wild Apricot event registrations into LMS course enrollments.
 *
 * Courses are linked to Wild Apricot events (CourseWaEvent); anyone registered
 * for a linked event gets enrolled, paid or not. Only enrollments this sync
 * created are ever removed — a teacher's manual enrollment and a student's own
 * self-enrollment are untouchable, which is what Enrollment.source records.
 *
 * Runs from three places, all through syncWaEnrollments():
 *   - the nightly cron        (src/app/api/cron/wildapricot/route.ts)
 *   - an admin/teacher button (src/lib/actions/wildapricot.ts)
 *   - a Wild Apricot sign-in  (src/app/auth/wildapricot/callback/route.ts)
 */

/** Report caps, so WaSyncRun.detail stays a sane size. */
const DETAIL_CAP = 200;

const emailMatchEnabled = () => process.env.WILDAPRICOT_SYNC_EMAIL_MATCH !== "false";

// ─── The sync ────────────────────────────────────────────────────────────────

export type WaSyncOptions = {
  trigger: WaSyncTrigger;
  /** Work everything out and report it, but write nothing. */
  dryRun?: boolean;
  /** Limit to one course's links. */
  courseId?: string;
  /** Sign-in path: one contact, grant-only. */
  waContactId?: number;
  /** Defaults to true for CRON and ADMIN, false for SIGN_IN. */
  allowRevoke?: boolean;
  /** Bypass the mass-revoke guard (explicit admin action only). */
  force?: boolean;
};

export type WaSyncChange = {
  userId: string;
  userName: string;
  courseId: string;
  courseCode: string;
  waEventId: number;
  matchedBy?: "contact" | "email";
};

export type WaSyncUnmatched = {
  waRegistrationId: number;
  waContactId: number | null;
  name: string;
  email: string | null;
  waEventId: number;
  courseId: string;
  courseCode: string;
  reason: "no-lms-account" | "no-contact-id";
};

export type WaSyncResult = {
  trigger: WaSyncTrigger;
  ok: boolean;
  dryRun: boolean;
  links: number;
  linksFailed: number;
  registrations: number;
  enrolled: WaSyncChange[];
  revoked: WaSyncChange[];
  unmatched: WaSyncUnmatched[];
  skippedRevocation: { courseId: string; courseCode: string; reason: string }[];
  errors: string[];
  startedAt: Date;
  finishedAt: Date;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function waSyncSummary(r: WaSyncResult): string {
  if (!r.links) return "No Wild Apricot events are linked to courses yet.";
  const bits = [
    `${r.registrations} registration${r.registrations === 1 ? "" : "s"} across ${r.links} event${r.links === 1 ? "" : "s"}`,
    `enrolled ${r.enrolled.length}`,
  ];
  if (r.revoked.length) bits.push(`removed ${r.revoked.length}`);
  if (r.unmatched.length) bits.push(`${r.unmatched.length} with no LMS account`);
  if (r.linksFailed) bits.push(`${r.linksFailed} event${r.linksFailed === 1 ? "" : "s"} failed`);
  return `${r.dryRun ? "Preview: would have " : ""}${bits.join(", ")}.`;
}

type LinkRow = {
  id: string;
  courseId: string;
  waEventId: number;
  revoke: boolean;
  endsAt: Date | null;
  course: { id: string; code: string; title: string };
};

export async function syncWaEnrollments(opts: WaSyncOptions): Promise<WaSyncResult> {
  const startedAt = new Date();
  const result: WaSyncResult = {
    trigger: opts.trigger,
    ok: true,
    dryRun: !!opts.dryRun,
    links: 0,
    linksFailed: 0,
    registrations: 0,
    enrolled: [],
    revoked: [],
    unmatched: [],
    skippedRevocation: [],
    errors: [],
    startedAt,
    finishedAt: startedAt,
  };
  const done = () => {
    result.finishedAt = new Date();
    return result;
  };

  // Not configured is "nothing to do", never an error: sign-in must not break.
  if (!waAdminEnabled()) {
    result.errors.push("Wild Apricot registration sync isn't configured.");
    return done();
  }

  const links: LinkRow[] = await db.courseWaEvent.findMany({
    where: { active: true, ...(opts.courseId ? { courseId: opts.courseId } : {}) },
    select: {
      id: true,
      courseId: true,
      waEventId: true,
      revoke: true,
      endsAt: true,
      course: { select: { id: true, code: true, title: true } },
    },
  });
  if (!links.length) return done();
  result.links = links.length;

  const allowRevoke = opts.allowRevoke ?? opts.trigger !== "SIGN_IN";

  // ── Fetch phase: read everything first, write nothing ──────────────────────
  const fetched = new Map<string, { regs: WaRegistration[]; ok: boolean }>();

  if (opts.waContactId) {
    // One contact-scoped call is authoritative for that contact across every event.
    let mine: WaRegistration[] = [];
    let ok = true;
    try {
      mine = (await waListContactRegistrations(opts.waContactId)).filter(isEligibleRegistration);
    } catch (e) {
      ok = false;
      result.ok = false;
      result.errors.push(`contact ${opts.waContactId}: ${errText(e)}`);
    }
    for (const link of links) fetched.set(link.id, { regs: mine.filter((r) => r.eventId === link.waEventId), ok });
    if (!ok) result.linksFailed = links.length;
  } else {
    let n = 0;
    for (const link of links) {
      // Serialized on purpose, with a pause every 10 calls: nightly volume is a
      // handful of events and being a polite API client matters more than speed.
      if (n && n % 10 === 0) await sleep(100);
      n++;
      try {
        const regs = (await waListEventRegistrations(link.waEventId)).filter(isEligibleRegistration);
        fetched.set(link.id, { regs, ok: true });
      } catch (e) {
        fetched.set(link.id, { regs: [], ok: false });
        result.ok = false;
        result.linksFailed++;
        const missing = e instanceof WaApiError && e.status === 404;
        result.errors.push(`${link.course.code} / event ${link.waEventId}: ${missing ? "no longer in Wild Apricot — unlink it" : errText(e)}`);
      }
    }
  }

  result.registrations = [...fetched.values()].reduce((s, f) => s + f.regs.length, 0);

  // ── Resolve phase: map Wild Apricot contacts to LMS users in two queries ──
  const allRegs = links.flatMap((l) => (fetched.get(l.id)?.regs ?? []).map((r) => ({ link: l, reg: r })));
  const contactIds = [...new Set(allRegs.map(({ reg }) => reg.contactId).filter((id): id is number => !!id))];
  const emails = [...new Set(allRegs.map(({ reg }) => reg.email).filter((e): e is string => !!e))];

  const byContact = new Map<number, { id: string; name: string }>();
  if (contactIds.length) {
    for (const u of await db.user.findMany({
      where: { waContactId: { in: contactIds }, active: true },
      select: { id: true, name: true, waContactId: true },
    })) {
      if (u.waContactId) byContact.set(u.waContactId, { id: u.id, name: u.name });
    }
  }

  const byEmail = new Map<string, { id: string; name: string }>();
  if (emailMatchEnabled() && emails.length) {
    // Enrollment only, and only for accounts not already tied to a different
    // contact. This never writes waContactId: linking accounts still requires
    // the person to prove they hold both (see the sign-on callback).
    for (const u of await db.user.findMany({
      where: { email: { in: emails }, waContactId: null, active: true },
      select: { id: true, name: true, email: true },
    })) {
      byEmail.set(u.email, { id: u.id, name: u.name });
    }
  }

  // ── Grant phase ───────────────────────────────────────────────────────────
  type Want = { userId: string; userName: string; waEventId: number; waRegistrationId: number; matchedBy: "contact" | "email" };
  const wanted = new Map<string, Map<string, Want>>(); // courseId → userId → want

  for (const { link, reg } of allRegs) {
    const viaContact = reg.contactId ? byContact.get(reg.contactId) : undefined;
    const viaEmail = !viaContact && reg.email ? byEmail.get(reg.email) : undefined;
    const user = viaContact ?? viaEmail;
    if (!user) {
      if (result.unmatched.length < DETAIL_CAP) {
        result.unmatched.push({
          waRegistrationId: reg.id,
          waContactId: reg.contactId,
          name: reg.name,
          email: reg.email,
          waEventId: link.waEventId,
          courseId: link.courseId,
          courseCode: link.course.code,
          reason: reg.contactId ? "no-lms-account" : "no-contact-id",
        });
      }
      continue;
    }
    const forCourse = wanted.get(link.courseId) ?? new Map<string, Want>();
    forCourse.set(user.id, {
      userId: user.id,
      userName: user.name,
      waEventId: link.waEventId,
      waRegistrationId: reg.id,
      matchedBy: viaContact ? "contact" : "email",
    });
    wanted.set(link.courseId, forCourse);
  }

  const courseIds = [...new Set(links.map((l) => l.courseId))];
  const now = new Date();

  for (const courseId of courseIds) {
    const courseLinks = links.filter((l) => l.courseId === courseId);
    const course = courseLinks[0].course;
    const want = wanted.get(courseId) ?? new Map<string, Want>();

    const existing = await db.enrollment.findMany({
      where: { courseId },
      select: { userId: true, source: true, waEventId: true },
    });
    const existingByUser = new Map(existing.map((e) => [e.userId, e]));

    for (const w of want.values()) {
      const row = existingByUser.get(w.userId);
      // A manual or self-enrollment stays exactly as it is — the sync doesn't own it.
      if (row?.source === "MANUAL") continue;
      if (!row) {
        result.enrolled.push({
          userId: w.userId,
          userName: w.userName,
          courseId,
          courseCode: course.code,
          waEventId: w.waEventId,
          matchedBy: w.matchedBy,
        });
      }
      if (opts.dryRun) continue;
      await db.enrollment.upsert({
        where: { userId_courseId: { userId: w.userId, courseId } },
        // update: {} would leave a synced row's event stale, so refresh those two
        // columns only — never `source`, which is why MANUAL rows were skipped above.
        update: { waEventId: w.waEventId, waRegistrationId: w.waRegistrationId },
        create: { userId: w.userId, courseId, source: "WILD_APRICOT", waEventId: w.waEventId, waRegistrationId: w.waRegistrationId },
      });
    }

    // ── Revoke phase ────────────────────────────────────────────────────────
    if (!allowRevoke) continue;
    const revocableEventIds = new Set(courseLinks.filter((l) => l.revoke && isInRevokeWindow(l.endsAt, now)).map((l) => l.waEventId));
    const { revoke, skipped } = computeRevocations({
      current: existing.filter((e) => e.source === "WILD_APRICOT").map((e) => ({ userId: e.userId, waEventId: e.waEventId })),
      desiredUserIds: new Set(want.keys()),
      revocableEventIds,
      allLinksFetched: courseLinks.every((l) => fetched.get(l.id)?.ok),
      force: opts.force,
    });
    if (skipped) {
      result.skippedRevocation.push({ courseId, courseCode: course.code, reason: skipped });
      continue;
    }
    if (!revoke.length) continue;

    const names = new Map((await db.user.findMany({ where: { id: { in: revoke } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
    for (const userId of revoke) {
      const row = existingByUser.get(userId);
      result.revoked.push({
        userId,
        userName: names.get(userId) ?? userId,
        courseId,
        courseCode: course.code,
        waEventId: row?.waEventId ?? 0,
      });
    }
    if (!opts.dryRun) {
      // source is repeated here, not just in the selection above, so a row that
      // became MANUAL between the read and this write still can't be lost.
      await db.enrollment.deleteMany({ where: { courseId, source: "WILD_APRICOT", userId: { in: revoke } } });
    }
  }

  if (!opts.dryRun) await recordRun(links, fetched, result, now);
  return done();
}

function errText(e: unknown) {
  return e instanceof Error ? e.message : "unknown error";
}

/** Per-link bookkeeping, the run record, and retiring links whose event is long over. */
async function recordRun(
  links: LinkRow[],
  fetched: Map<string, { regs: WaRegistration[]; ok: boolean }>,
  result: WaSyncResult,
  now: Date,
) {
  for (const link of links) {
    const f = fetched.get(link.id);
    const error = result.errors.find((e) => e.includes(`event ${link.waEventId}`)) ?? null;
    // An event that ended more than the grace period ago stops being polled: it
    // can no longer change, and its learners keep the access it granted.
    const retire = !isInRevokeWindow(link.endsAt, now);
    await db.courseWaEvent.update({
      where: { id: link.id },
      data: {
        lastSyncedAt: now,
        ...(f?.ok ? { lastCount: f.regs.length, lastError: null } : { lastError: error ?? "Wild Apricot couldn't be reached." }),
        ...(retire ? { active: false, lastError: `Event ended over ${REVOKE_GRACE_DAYS} days ago — syncing stopped. Enrolled learners keep access.` } : {}),
      },
    });
  }

  // A routine sign-in that changed nothing isn't worth a row.
  const quiet =
    result.trigger === "SIGN_IN" &&
    !result.enrolled.length &&
    !result.revoked.length &&
    !result.errors.length &&
    !result.skippedRevocation.length;
  if (quiet) return;

  await db.waSyncRun.create({
    data: {
      trigger: result.trigger,
      dryRun: result.dryRun,
      ok: result.ok,
      links: result.links,
      linksFailed: result.linksFailed,
      registrations: result.registrations,
      enrolled: result.enrolled.length,
      revoked: result.revoked.length,
      unmatched: result.unmatched.length,
      summary: waSyncSummary(result),
      detail: {
        enrolled: result.enrolled.slice(0, DETAIL_CAP),
        revoked: result.revoked.slice(0, DETAIL_CAP),
        unmatched: result.unmatched.slice(0, DETAIL_CAP),
        skippedRevocation: result.skippedRevocation,
        errors: result.errors,
      },
      finishedAt: new Date(),
    },
  });

  // Keep the run log from growing without bound.
  await db.waSyncRun.deleteMany({ where: { startedAt: { lt: new Date(now.getTime() - 30 * 86400000) } } });
}
