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

const siblings = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];

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
check("single item, unchanged", orderUpdates([{ id: "a" }], ["a"]), []);
check("single item, wrong id", orderUpdates([{ id: "a" }], ["b"]), null);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
