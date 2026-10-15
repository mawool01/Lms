// Wild Apricot API discovery script.
//
// The event-registration sync has to make two decisions this script answers:
//   1. Which `Status` values mean "this person isn't coming"? (undocumented enum)
//   2. Does a cancelled registration stay in the list, or disappear from it?
// It also confirms the collection wrappers, the date field names and that
// $top/$skip paging works on this tenant.
//
// Usage:
//   WILDAPRICOT_API_KEY=xxxx node scripts/wa-dump.mjs                 # list recent events
//   WILDAPRICOT_API_KEY=xxxx node scripts/wa-dump.mjs <eventId>       # dump that event's registrations
//   WILDAPRICOT_API_KEY=xxxx node scripts/wa-dump.mjs <eventId> <contactId>
//
// Reads only. Nothing here writes to Wild Apricot or to the database.

const API_KEY = process.env.WILDAPRICOT_API_KEY ?? "";
const OAUTH_URL = (process.env.WILDAPRICOT_OAUTH_URL ?? "https://oauth.wildapricot.org").replace(/\/$/, "");
const API_URL = (process.env.WILDAPRICOT_API_URL ?? "https://api.wildapricot.org").replace(/\/$/, "");

if (!API_KEY) {
  console.error("\n✖ Set WILDAPRICOT_API_KEY first.");
  console.error("  In Wild Apricot: Settings → Integration → API keys → Authorize application → Server application.\n");
  process.exit(1);
}

const [eventIdArg, contactIdArg] = process.argv.slice(2);
const line = (s = "") => console.log(s);
const rule = (t) => line(`\n${"═".repeat(70)}\n${t}\n${"═".repeat(70)}`);

async function token() {
  const res = await fetch(`${OAUTH_URL}/auth/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`APIKEY:${API_KEY}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({ grant_type: "client_credentials", scope: "auto" }),
  });
  const body = await res.text();
  if (!res.ok) {
    console.error(`✖ Token request failed (${res.status}):\n${body}`);
    process.exit(1);
  }
  return JSON.parse(body);
}

async function get(t, path, query = {}) {
  const qs = new URLSearchParams(Object.entries(query).map(([k, v]) => [k, String(v)])).toString();
  const url = `${API_URL}/v2.2/accounts/${t.accountId}${path}${qs ? `?${qs}` : ""}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${t.access_token}`, Accept: "application/json" } });
  const text = await res.text();
  if (!res.ok) {
    line(`  ✖ ${res.status} ${path}${qs ? `?${qs}` : ""}`);
    line(`    ${text.slice(0, 400)}`);
    return null;
  }
  return JSON.parse(text);
}

const shape = (body, key) => {
  if (Array.isArray(body)) return { kind: "bare array", rows: body };
  if (body && typeof body === "object" && Array.isArray(body[key])) return { kind: `wrapped in { ${key}: [...] }`, rows: body[key] };
  if (body && typeof body === "object") return { kind: `object with keys: ${Object.keys(body).join(", ")}`, rows: [] };
  return { kind: typeof body, rows: [] };
};

rule("1. Token exchange (API key → client_credentials, scope=auto)");
const raw = await token();
const accountId = Number(process.env.WILDAPRICOT_ACCOUNT_ID) || raw.Permissions?.[0]?.AccountId;
const t = { access_token: raw.access_token, accountId };
line(`  expires_in           ${raw.expires_in} s`);
line(`  AccountId            ${accountId}`);
line(`  Permissions entries  ${raw.Permissions?.length ?? 0}`);
line(`  granted scope        ${raw.scope ?? "(not returned)"}`);
if (raw.Permissions?.[0]?.AvailableScopes) line(`  AvailableScopes      ${JSON.stringify(raw.Permissions[0].AvailableScopes)}`);
if (!accountId) {
  console.error("\n✖ No AccountId in the token response — set WILDAPRICOT_ACCOUNT_ID.\n");
  process.exit(1);
}

rule("2. GET /events?$top=5 — collection wrapper and date fields");
const events = await get(t, "/events", { $top: 5, $skip: 0 });
if (events) {
  const { kind, rows } = shape(events, "Events");
  line(`  response shape: ${kind}`);
  line(`  rows returned:  ${rows.length}`);
  if (rows[0]) {
    line(`  first event keys: ${Object.keys(rows[0]).join(", ")}`);
    line("\n  Recent events (id · name · start · end):");
    for (const e of rows) line(`    ${String(e.Id).padEnd(8)} ${String(e.Name ?? "").slice(0, 40).padEnd(42)} ${e.StartDate ?? "-"}  ${e.EndDate ?? "-"}`);
  }
  if (!eventIdArg) line("\n  → Re-run with an event id to dump its registrations: node scripts/wa-dump.mjs <eventId>");
}

if (eventIdArg) {
  rule(`3. GET /eventregistrations?eventId=${eventIdArg} — THE KEY STEP`);
  const regs = await get(t, "/eventregistrations", { eventId: eventIdArg, $top: 5, $skip: 0 });
  if (regs) {
    const { kind, rows } = shape(regs, "EventRegistrations");
    line(`  response shape: ${kind}`);
    line(`  rows returned:  ${rows.length}`);
    if (rows[0]) {
      line(`\n  first registration keys: ${Object.keys(rows[0]).join(", ")}`);
      line("\n  ── ONE FULL REGISTRATION, VERBATIM ──");
      line(JSON.stringify(rows[0], null, 2).split("\n").map((l) => `  ${l}`).join("\n"));
      line("\n  Does Contact carry an Email?  " + (rows[0].Contact?.Email ? "YES" : "NO — the sync will fall back to RegistrationFields"));
    }

    rule(`4. Status values across every registration for event ${eventIdArg}`);
    const all = await get(t, "/eventregistrations", { eventId: eventIdArg, $top: 100, $skip: 0 });
    const allRows = all ? shape(all, "EventRegistrations").rows : [];
    const counts = new Map();
    for (const r of allRows) counts.set(r.Status ?? "(null)", (counts.get(r.Status ?? "(null)") ?? 0) + 1);
    line(`  ${allRows.length} registrations, status breakdown:`);
    for (const [status, n] of [...counts].sort((a, b) => b[1] - a[1])) line(`    ${String(status).padEnd(24)} ${n}`);
    line("\n  → Put any status meaning \"not coming\" into WA_INELIGIBLE_STATUSES");
    line("    in src/lib/wildapricot-sync.ts.");
    line("  → Now cancel one registration in Wild Apricot and re-run: if it vanishes");
    line("    from this list, revocation already works and the deny list can stay empty.");

    rule("5. Pagination ($top / $skip)");
    const page2 = await get(t, "/eventregistrations", { eventId: eventIdArg, $top: 100, $skip: 100 });
    const page2Rows = page2 ? shape(page2, "EventRegistrations").rows : [];
    line(`  page 1 ($skip=0):   ${allRows.length} rows`);
    line(`  page 2 ($skip=100): ${page2Rows.length} rows`);
    const counted = await get(t, "/eventregistrations", { eventId: eventIdArg, $count: true });
    line(`  $count supported:   ${counted && !Array.isArray(counted) && counted.Count !== undefined ? `yes (${counted.Count})` : "no / not reported"}`);
  }
}

if (contactIdArg) {
  rule(`6. GET /eventregistrations?contactId=${contactIdArg} — the sign-in path`);
  const mine = await get(t, "/eventregistrations", { contactId: contactIdArg, $top: 100, $skip: 0 });
  if (mine) {
    const { kind, rows } = shape(mine, "EventRegistrations");
    line(`  response shape: ${kind}`);
    line(`  rows returned:  ${rows.length}`);
    for (const r of rows) line(`    reg ${String(r.Id).padEnd(10)} event ${String(r.Event?.Id ?? "?").padEnd(8)} ${String(r.Event?.Name ?? "").slice(0, 34).padEnd(36)} ${r.Status ?? "(null)"}`);
    line("\n  → If this returned rows, the sign-in hook can use one contact-scoped call.");
  }
}

line("\nDone. Nothing was written.\n");
