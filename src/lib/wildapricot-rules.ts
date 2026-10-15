/**
 * The decision rules behind the Wild Apricot enrollment sync, kept free of any
 * database or network dependency so they can be reasoned about — and tested —
 * on their own. The sync engine that uses them is in wildapricot-sync.ts.
 *
 * Deliberately no `server-only` here: these are pure functions.
 */

/** How long after an event ends we still mirror cancellations. */
export const REVOKE_GRACE_DAYS = 30;
/** Above this many removals, and at least half the course's synced roster, stop and ask. */
export const MASS_REVOKE_MIN = 5;

/**
 * Wild Apricot statuses that mean "this person isn't coming".
 *
 * Deliberately empty: the Status enum isn't documented, so run
 * `node scripts/wa-dump.mjs <eventId>` against the real tenant and add whatever
 * it reports before relying on revocation. If Wild Apricot drops cancelled
 * registrations from the list entirely, this can stay empty and revocation
 * still works.
 */
export const WA_INELIGIBLE_STATUSES = new Set<string>([]);

/** Payment is deliberately ignored: any registration grants access. */
export function isEligibleRegistration(r: { status: string | null }) {
  return !(r.status && WA_INELIGIBLE_STATUSES.has(r.status));
}

/** An event stops mirroring cancellations once it has been over for REVOKE_GRACE_DAYS. */
export function isInRevokeWindow(endsAt: Date | null, now = new Date()) {
  if (!endsAt) return true;
  return endsAt.getTime() > now.getTime() - REVOKE_GRACE_DAYS * 86400000;
}

export type WaExistingEnrollment = { userId: string; waEventId: number | null };

export type WaRevocationInput = {
  /** Existing source = WILD_APRICOT enrollments for one course. */
  current: WaExistingEnrollment[];
  /** Users who still have a live registration for that course. */
  desiredUserIds: Set<string>;
  /** Events allowed to remove access right now: active, revoke on, inside the grace window. */
  revocableEventIds: Set<number>;
  /** False when any active link for the course failed to fetch. */
  allLinksFetched: boolean;
  /** Admin override for the mass-revoke guard. */
  force?: boolean;
};

export type WaRevocationOutput = { revoke: string[]; skipped: string | null };

/**
 * Decides which synced enrollments to remove for one course.
 *
 * Every guard here exists because the damaging failure is removing a whole
 * roster off the back of a bad API response:
 *  - a failed fetch for any of the course's events leaves the roster alone;
 *  - an enrollment with no waEventId (granted before the column existed, or by
 *    a link since deleted) is never removed;
 *  - an event outside its grace window keeps the access it granted forever;
 *  - a suspiciously large removal is reported instead of applied.
 */
export function computeRevocations(input: WaRevocationInput): WaRevocationOutput {
  const { current, desiredUserIds, revocableEventIds, allLinksFetched, force } = input;
  if (!allLinksFetched) return { revoke: [], skipped: "a Wild Apricot request failed, so the roster was left alone" };
  if (!revocableEventIds.size) return { revoke: [], skipped: null };

  const stale = current
    .filter((e) => !desiredUserIds.has(e.userId) && e.waEventId !== null && revocableEventIds.has(e.waEventId))
    .map((e) => e.userId);
  if (!stale.length) return { revoke: [], skipped: null };

  if (!force && stale.length > MASS_REVOKE_MIN && stale.length * 2 >= current.length) {
    return { revoke: [], skipped: `would remove ${stale.length} of ${current.length} synced learners — run "Sync now (force)" to confirm` };
  }
  return { revoke: stale, skipped: null };
}
