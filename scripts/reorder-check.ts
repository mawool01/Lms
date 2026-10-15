// Checks the drag-to-reorder validation — the logic that decides whether a
// submitted order is allowed to move anything. Pure, so no database needed.
//
//   npx tsx scripts/reorder-check.ts
import { orderUpdates } from "../src/lib/reorder";

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

/** A tidy list: positions are 0..n-1 and match the order shown. */
const siblings = [
  { id: "a", position: 0 },
  { id: "b", position: 1 },
  { id: "c", position: 2 },
  { id: "d", position: 3 },
];

console.log("\norderUpdates — valid reorders");

check("unchanged order writes nothing", orderUpdates(siblings, ["a", "b", "c", "d"]), []);

// Dragging one row only rewrites the rows that actually moved.
check(
  "moving the first row to the end",
  orderUpdates(siblings, ["b", "c", "d", "a"]),
  [
    { id: "b", position: 0 },
    { id: "c", position: 1 },
    { id: "d", position: 2 },
    { id: "a", position: 3 },
  ],
);

check(
  "swapping two neighbours touches only those two",
  orderUpdates(siblings, ["b", "a", "c", "d"]),
  [
    { id: "b", position: 0 },
    { id: "a", position: 1 },
  ],
);

check(
  "full reversal",
  orderUpdates(siblings, ["d", "c", "b", "a"]),
  [
    { id: "d", position: 0 },
    { id: "c", position: 1 },
    { id: "b", position: 2 },
    { id: "a", position: 3 },
  ],
);

console.log("\norderUpdates — rejected, writes nothing (null)");

// These are the cases that matter: a bad list must not reposition anything.
check("an id from someone else's list", orderUpdates(siblings, ["a", "b", "c", "x"]), null);
check("a duplicated id", orderUpdates(siblings, ["a", "a", "b", "c"]), null);
check("a missing id (stale list, item deleted meanwhile)", orderUpdates(siblings, ["a", "b", "c"]), null);
check("an extra id (stale list, item added meanwhile)", orderUpdates(siblings, ["a", "b", "c", "d", "e"]), null);
check("an empty list against a non-empty one", orderUpdates(siblings, []), null);
check("entirely foreign ids", orderUpdates(siblings, ["w", "x", "y", "z"]), null);

console.log("\norderUpdates — edge cases");
check("empty list is a no-op, not a rejection", orderUpdates([], []), []);
check("single item, unchanged", orderUpdates([{ id: "a", position: 0 }], ["a"]), []);
check("single item, wrong id", orderUpdates([{ id: "a", position: 0 }], ["b"]), null);

// The case that actually broke in production. Deleting a row leaves a gap, and
// a new row numbered from a count then reuses a position that is still in use.
// Two rows sharing a position means the database's order is a tie broken
// arbitrarily, which need not be the order the browser was showing — so what
// gets written must not be decided by a row's index in that list.
console.log("\norderUpdates — gapped and duplicated positions");

const gapped = [
  { id: "a", position: 0 },
  { id: "c", position: 2 },
  { id: "d", position: 3 },
  { id: "e", position: 3 }, // same position as d: numbered from a count after a delete
];

check(
  "leaving a tied list alone still renumbers it 0..n-1",
  orderUpdates(gapped, ["a", "c", "d", "e"]),
  [
    { id: "c", position: 1 },
    { id: "d", position: 2 },
    // e already stores 3, which is where it belongs, so it needs no write
  ],
);

check(
  "moving the tied row to the front writes only what is wrong",
  orderUpdates(gapped, ["e", "a", "c", "d"]),
  [
    { id: "e", position: 0 },
    { id: "a", position: 1 },
    // c already stores 2 and d already stores 3, so both are left alone
  ],
);

// The regression this guards. Dragging "e" above "d" has to move "c" down to 1.
// Going by index, c sat at index 1 already and would have been skipped, keeping
// its stored 2 — the same position this run gives "e", so the two collided and
// the list came back in an order nobody chose.
const moved = orderUpdates(gapped, ["a", "c", "e", "d"]);
check("the row an index-based check would have skipped is written", moved, [
  { id: "c", position: 1 },
  { id: "e", position: 2 },
]);

// Whatever is written, applying it must leave every row on its own position.
const finalPositions = new Map(gapped.map((s) => [s.id, s.position]));
for (const u of moved ?? []) finalPositions.set(u.id, u.position);
check(
  "after applying, the stored order matches what was asked for",
  [...finalPositions.entries()].sort((x, y) => x[1] - y[1]).map(([id]) => id),
  ["a", "c", "e", "d"],
);
check("and no two rows share a position", new Set(finalPositions.values()).size, finalPositions.size);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
