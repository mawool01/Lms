// Checks the portfolio date logic — reading the form's month and year boxes,
// where the month is optional, and rendering what comes back. Pure, so no
// database needed.
//
//   npx tsx scripts/portfolio-date-check.ts
import { formatMonth, itemDates, parseYearMonth } from "../src/lib/portfolio-meta";

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

/** Compact view of a parse result, so the checks below read as dates. */
const parsed = (month: string, year: string) => {
  const r = parseYearMonth(month, year);
  if (r === undefined) return "rejected";
  if (!r.date) return "no date";
  return `${r.date.toISOString().slice(0, 10)}${r.yearOnly ? " (year only)" : ""}`;
};

console.log("\nparseYearMonth — what the form sends");
check("a month and a year", parsed("03", "2024"), "2024-03-01");
check("a year with no month is kept as year only", parsed("", "2024"), "2024-01-01 (year only)");
check("January is not mistaken for a missing month", parsed("01", "2024"), "2024-01-01");
check("both boxes empty means no date", parsed("", ""), "no date");
check("December", parsed("12", "1999"), "1999-12-01");

console.log("\nparseYearMonth — rejected (the form is asked again)");
check("a month with no year is a half-filled form", parsed("03", ""), "rejected");
check("a two-digit year", parsed("", "99"), "rejected");
check("a year before 1900", parsed("", "1899"), "rejected");
check("a year after 2100", parsed("", "2101"), "rejected");
check("a month of 00", parsed("00", "2024"), "rejected");
check("a month of 13", parsed("13", "2024"), "rejected");
check("a non-numeric year", parsed("", "two thousand"), "rejected");

console.log("\nformatMonth");
const march = new Date("2024-03-01T00:00:00Z");
const jan = new Date("2023-01-01T00:00:00Z");
check("a month and year", formatMonth(march), "Mar 2024");
check("the same date as year only", formatMonth(march, true), "2024");
// The pair that has to stay distinguishable: both are stored as 1 January.
check("a genuine January", formatMonth(jan), "Jan 2023");
check("a year-only 2023", formatMonth(jan, true), "2023");
check("no date at all", formatMonth(null), "");

console.log("\nitemDates");
const item = (o: Partial<Parameters<typeof itemDates>[0]>) => ({ startDate: null, endDate: null, current: false, ...o });
check("single, with a month", itemDates(item({ startDate: march }), "single"), "Mar 2024");
check("single, year only", itemDates(item({ startDate: march, startYearOnly: true }), "single"), "2024");
check(
  "a range where both ends are year only",
  itemDates(item({ startDate: jan, startYearOnly: true, endDate: march, endYearOnly: true }), "range"),
  "2023 – 2024",
);
// Knowing the month you started but only the year you left is common.
check(
  "a range with a month at one end and not the other",
  itemDates(item({ startDate: march, endDate: jan, endYearOnly: true }), "range"),
  "Mar 2024 – 2023",
);
check("an ongoing range", itemDates(item({ startDate: march, current: true }), "range"), "Mar 2024 – Present");
check("an ongoing range recorded by year", itemDates(item({ startDate: march, startYearOnly: true, current: true }), "range"), "2024 – Present");
check("no dates at all", itemDates(item({}), "range"), "");

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
