// Checks the Wild Apricot sync's revocation rules — the logic that decides whether a
// learner loses course access. Pure functions, so this needs no database and no
// network: run it after touching src/lib/wildapricot-rules.ts.
//
//   npx tsx scripts/wa-revocation-check.ts
import { computeRevocations, isInRevokeWindow, isLinkRetired, isLinkRevocable, type WaRevocationInput } from "../src/lib/wildapricot-rules";

let pass = 0;
let fail = 0;

function check(name: string, got: unknown, want: unknown) {
  const a = JSON.stringify(got);
  const b = JSON.stringify(want);
  if (a === b) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.log(`  ✗ ${name}\n      got:  ${a}\n      want: ${b}`);
  }
}

const base = (over: Partial<WaRevocationInput> = {}): WaRevocationInput => ({
  current: [],
  desiredUserIds: new Set<string>(),
  revocableLinkIds: new Set<string>(["link-a"]),
  allLinksFetched: true,
  ...over,
});

const users = (n: number, waLinkId: string | null = "link-a") =>
  Array.from({ length: n }, (_, i) => ({ userId: `u${i}`, waLinkId }));

console.log("\ncomputeRevocations");

// The dangerous case: a failed fetch must never look like "everybody cancelled".
check(
  "failed fetch leaves the roster alone",
  computeRevocations(base({ current: users(3), allLinksFetched: false })),
  { revoke: [], skipped: "a Wild Apricot request failed, so the roster was left alone" },
);

// An empty-but-successful list is a real "nobody is registered any more".
check(
  "empty successful list revokes (under the mass guard)",
  computeRevocations(base({ current: users(3) })),
  { revoke: ["u0", "u1", "u2"], skipped: null },
);

check(
  "still-registered learners are kept",
  computeRevocations(base({ current: users(3), desiredUserIds: new Set(["u0", "u1"]) })),
  { revoke: ["u2"], skipped: null },
);

check(
  "nothing to do when everyone is still registered",
  computeRevocations(base({ current: users(3), desiredUserIds: new Set(["u0", "u1", "u2"]) })),
  { revoke: [], skipped: null },
);

// Manual rows never reach this function, but a synced row with no event must not be touched.
check(
  "enrollment with no waLinkId is never revoked",
  computeRevocations(base({ current: users(3, null) })),
  { revoke: [], skipped: null },
);

check(
  "enrollment from a non-revocable link is kept",
  computeRevocations(base({ current: users(3, "link-other") })),
  { revoke: [], skipped: null },
);

check(
  "no revocable links at all is a no-op",
  computeRevocations(base({ current: users(3), revocableLinkIds: new Set() })),
  { revoke: [], skipped: null },
);

// Mass-revoke guard: >5 removals AND >= half the synced roster.
check(
  "6 of 6 is blocked by the mass guard",
  computeRevocations(base({ current: users(6) })),
  { revoke: [], skipped: 'would remove 6 of 6 synced learners — run "Sync now (force)" to confirm' },
);

check(
  "force overrides the mass guard",
  computeRevocations(base({ current: users(6), force: true })),
  { revoke: ["u0", "u1", "u2", "u3", "u4", "u5"], skipped: null },
);

check(
  "5 of 5 is allowed (at the threshold, not over it)",
  computeRevocations(base({ current: users(5) })),
  { revoke: ["u0", "u1", "u2", "u3", "u4"], skipped: null },
);

check(
  "6 of 20 is allowed (over the count, under half)",
  computeRevocations(
    base({
      current: users(20),
      desiredUserIds: new Set(Array.from({ length: 14 }, (_, i) => `u${i + 6}`)),
    }),
  ),
  { revoke: ["u0", "u1", "u2", "u3", "u4", "u5"], skipped: null },
);

console.log("\nisInRevokeWindow");
const now = new Date("2026-10-14T12:00:00Z");
check("an event with no end date stays revocable", isInRevokeWindow(null, now), true);
check("an upcoming event is revocable", isInRevokeWindow(new Date("2026-12-01T00:00:00Z"), now), true);
check("an event that ended 5 days ago is revocable", isInRevokeWindow(new Date("2026-10-09T00:00:00Z"), now), true);
check("an event that ended 29 days ago is revocable", isInRevokeWindow(new Date("2026-09-15T12:00:00Z"), now), true);
check("an event that ended 31 days ago is not", isInRevokeWindow(new Date("2026-09-13T00:00:00Z"), now), false);
check("a 2024 event is not", isInRevokeWindow(new Date("2024-03-01T00:00:00Z"), now), false);

console.log("\nisLinkRevocable — groups and levels are live entitlements, events expire");
const old = new Date("2024-03-01T00:00:00Z");
const soon = new Date("2026-12-01T00:00:00Z");

check("upcoming event: revocable", isLinkRevocable({ kind: "EVENT", revoke: true, endsAt: soon }, now), true);
check("long-past event: not revocable", isLinkRevocable({ kind: "EVENT", revoke: true, endsAt: old }, now), false);
check("group: revocable", isLinkRevocable({ kind: "GROUP", revoke: true, endsAt: null }, now), true);
check("level: revocable", isLinkRevocable({ kind: "LEVEL", revoke: true, endsAt: null }, now), true);
// A group carrying a stale end date must not inherit the event expiry rule.
check("group with a past end date: still revocable", isLinkRevocable({ kind: "GROUP", revoke: true, endsAt: old }, now), true);
check("level with a past end date: still revocable", isLinkRevocable({ kind: "LEVEL", revoke: true, endsAt: old }, now), true);
// The per-link switch wins over everything.
check("revoke off, event: not revocable", isLinkRevocable({ kind: "EVENT", revoke: false, endsAt: soon }, now), false);
check("revoke off, group: not revocable", isLinkRevocable({ kind: "GROUP", revoke: false, endsAt: null }, now), false);
check("revoke off, level: not revocable", isLinkRevocable({ kind: "LEVEL", revoke: false, endsAt: null }, now), false);

console.log("\nisLinkRetired — only events go dormant");
check("long-past event retires", isLinkRetired({ kind: "EVENT", endsAt: old }, now), true);
check("upcoming event doesn't", isLinkRetired({ kind: "EVENT", endsAt: soon }, now), false);
check("undated event doesn't", isLinkRetired({ kind: "EVENT", endsAt: null }, now), false);
check("a group never retires", isLinkRetired({ kind: "GROUP", endsAt: old }, now), false);
check("a level never retires", isLinkRetired({ kind: "LEVEL", endsAt: old }, now), false);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
