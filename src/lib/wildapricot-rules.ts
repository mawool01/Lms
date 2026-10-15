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

export type WaLinkKindName = "EVENT" | "GROUP" | "LEVEL";

/**
 * Whether a link may currently remove access.
 *
 * Groups and membership levels are live entitlements: being in the group or
 * holding the level is what grants the course, so losing it takes the course
 * away for as long as the link is active. An event is a one-off that can't
 * change once it's well past, so it stops mirroring cancellations after the
 * grace period — otherwise tidying up old Wild Apricot registrations would
 * strip access to a course someone finished years ago.
 */
export function isLinkRevocable(
  link: { kind: WaLinkKindName; revoke: boolean; endsAt: Date | null },
  now = new Date(),
) {
  if (!link.revoke) return false;
  return link.kind === "EVENT" ? isInRevokeWindow(link.endsAt, now) : true;
}

/** An event link goes dormant once it's long over; groups and levels never do. */
export function isLinkRetired(link: { kind: WaLinkKindName; endsAt: Date | null }, now = new Date()) {
  return link.kind === "EVENT" && !isInRevokeWindow(link.endsAt, now);
}

export type WaExistingEnrollment = { userId: string; waLinkId: string | null };

export type WaRevocationInput = {
  /** Existing source = WILD_APRICOT enrollments for one course. */
  current: WaExistingEnrollment[];
  /** Users still covered by one of that course's links. */
  desiredUserIds: Set<string>;
  /** Ids of the links allowed to remove access right now — see isLinkRevocable. */
  revocableLinkIds: Set<string>;
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
 *  - a failed fetch for any of the course's links leaves the roster alone;
 *  - an enrollment with no waLinkId (granted by a link since unlinked, or
 *    before the column existed) is never removed;
 *  - a link that isn't currently revocable keeps the access it granted;
 *  - a suspiciously large removal is reported instead of applied.
 */
export function computeRevocations(input: WaRevocationInput): WaRevocationOutput {
  const { current, desiredUserIds, revocableLinkIds, allLinksFetched, force } = input;
  if (!allLinksFetched) return { revoke: [], skipped: "a Wild Apricot request failed, so the roster was left alone" };
  if (!revocableLinkIds.size) return { revoke: [], skipped: null };

  const stale = current
    .filter((e) => !desiredUserIds.has(e.userId) && e.waLinkId !== null && revocableLinkIds.has(e.waLinkId))
    .map((e) => e.userId);
  if (!stale.length) return { revoke: [], skipped: null };

  if (!force && stale.length > MASS_REVOKE_MIN && stale.length * 2 >= current.length) {
    return { revoke: [], skipped: `would remove ${stale.length} of ${current.length} synced learners — run "Sync now (force)" to confirm` };
  }
  return { revoke: stale, skipped: null };
}
