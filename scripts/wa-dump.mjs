// Wild Apricot API discovery script.
//
// The sync has to make decisions this script answers against the real tenant:
//   1. Which registration `Status` values mean "this person isn't coming"?
//      (the enum isn't documented)
//   2. Does a cancelled registration stay in the list, or disappear from it?
//   3. Does a member group really return ContactIds?
//   4. Does the membership-level contacts filter work, and does it come back
//      asynchronously?
// It also confirms the collection wrappers, date field names and $top/$skip
// paging on this tenant.
//
// Usage:
//   WILDAPRICOT_API_KEY=xxxx node scripts/wa-dump.mjs                 # events, groups, levels
//   WILDAPRICOT_API_KEY=xxxx node scripts/wa-dump.mjs <eventId>       # dump that event's registrations
//   WILDAPRICOT_API_KEY=xxxx node scripts/wa-dump.mjs <eventId> <contactId>
//
// Reads only. Nothing here writes to Wild Apricot or to the database.

const API_KEY = process.env.WILDAPRICOT_API_KEY ?? "";
const OAUTH_URL = (process.env.WILDAPRICOT_OAUTH_URL ?? "https://oauth.wildapricot.org").replace(/\/$/, "");
const API_URL = (process.env.WILDAPRICOT_API_URL ?? "https://api.wildapricot.org").replace(/\/$/, "");

if (!API_KEY) {
  console.error("\n✖ Set WILDAPRICOT_API_KEY first.");
  console.error("  Wild Apricot admin view → Apps → Authorized applications → your server application:");
  console.error("  the API key is shown under the Application name field, above the client id/secret.\n");
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
    line("    in src/lib/wildapricot-rules.ts.");
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

rule("6. GET /membergroups — member groups");
const groups = await get(t, "/membergroups", { $top: 100, $skip: 0 });
if (groups) {
  const { kind, rows } = shape(groups, "MemberGroups");
  line(`  response shape: ${kind}`);
  line(`  groups:         ${rows.length}`);
  if (rows[0]) line(`  first group keys: ${Object.keys(rows[0]).join(", ")}`);
  for (const g of rows.slice(0, 15)) line(`    ${String(g.Id).padEnd(10)} ${String(g.Name ?? "").slice(0, 40).padEnd(42)} ${g.ContactsCount ?? "?"} members`);
  if (rows[0]) {
    const gid = rows[0].Id;
    line(`\n  --- GET /membergroups/${gid}?includeArchivedMembers=false ---`);
    const one = await get(t, `/membergroups/${gid}`, { includeArchivedMembers: "false" });
    const g = Array.isArray(one) ? one[0] : one;
    if (g) {
      line(`  keys: ${Object.keys(g).join(", ")}`);
      line(`  ContactIds present: ${Array.isArray(g.ContactIds) ? `YES (${g.ContactIds.length})` : "NO — the sync needs this"}`);
      if (Array.isArray(g.ContactIds)) line(`  first few ids: ${g.ContactIds.slice(0, 8).join(", ")}`);
    }
  }
}

rule("7. GET /membershiplevels — membership levels");
const levels = await get(t, "/membershiplevels", { $top: 100, $skip: 0 });
let firstLevelId = null;
if (levels) {
  const { kind, rows } = shape(levels, "MembershipLevels");
  line(`  response shape: ${kind}`);
  line(`  levels:         ${rows.length}`);
  if (rows[0]) {
    line(`  first level keys: ${Object.keys(rows[0]).join(", ")}`);
    firstLevelId = rows[0].Id;
  }
  for (const l of rows) line(`    ${String(l.Id).padEnd(10)} ${String(l.Name ?? "").slice(0, 40).padEnd(42)} ${l.Type ?? ""}`);
}

if (firstLevelId) {
  rule(`8. GET /contacts?$filter='Membership level ID' eq ${firstLevelId} — the LEVEL path`);
  line("  This is the one filter the sync uses that isn't confirmed against a real");
  line("  tenant yet. If it errors, the level links will report that error and");
  line("  revoke nobody — paste the output and the filter can be corrected.\n");
  const contacts = await get(t, "/contacts", {
    $filter: `'Membership level ID' eq ${firstLevelId}`,
    $async: "false",
    $top: 5,
    $skip: 0,
  });
  if (contacts) {
    const { kind, rows } = shape(contacts, "Contacts");
    line(`  response shape: ${kind}`);
    line(`  rows:           ${rows.length}`);
    if (!Array.isArray(contacts) && contacts.State) line(`  State: ${contacts.State}  ResultId: ${contacts.ResultId ?? "(none)"} → async, the sync polls`);
    if (rows[0]) {
      line(`  first contact keys: ${Object.keys(rows[0]).join(", ")}`);
      const statuses = new Map();
      for (const c of rows) statuses.set(`${c.Status ?? "(null)"} / enabled=${c.MembershipEnabled}`, (statuses.get(`${c.Status ?? "(null)"} / enabled=${c.MembershipEnabled}`) ?? 0) + 1);
      line("  status / MembershipEnabled seen:");
      for (const [k, n] of statuses) line(`    ${String(k).padEnd(40)} ${n}`);
      line("\n  → LAPSED_STATUSES in src/lib/wildapricot-admin.ts filters these.");
    }
  }
}

if (contactIdArg) {
  rule(`9. GET /eventregistrations?contactId=${contactIdArg} — the sign-in path`);
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
