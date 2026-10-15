import "server-only";
import { WaApiError, WaError, waAdminEnabled, waConfig } from "./wildapricot";

/**
 * Wild Apricot server-to-server API client, used to read events and event
 * registrations so registrations can grant LMS course access.
 *
 * This is a different integration from the sign-on flow in wildapricot.ts: it
 * authenticates with an API key rather than as a person, so it works from the
 * nightly cron with no one signed in.
 *
 *   WILDAPRICOT_API_KEY     Apps → Authorized applications → your server application;
 *                           the API key sits under the Application name field, above
 *                           the client id/secret the sign-on flow uses. The application
 *                           needs events and contacts access, not just "Wild Apricot login".
 *   WILDAPRICOT_ACCOUNT_ID  optional; only if the key covers several accounts
 *
 * Wild Apricot made pagination mandatory on 1 November 2025, so every list call
 * here pages with $top/$skip.
 */

const PAGE_SIZE = 100;
/** A registration list longer than this is treated as an error, never truncated — see waListAll. */
const MAX_PAGES = 50;

type AdminToken = { token: string; accountId: number; expiresAt: number };

let cachedToken: AdminToken | null = null;

/** Dropped when a 401 suggests the cached token went stale early. */
function clearTokenCache() {
  cachedToken = null;
}

/**
 * Client-credentials token for the API key. Wild Apricot's tokens last about 30
 * minutes; we cache per serverless instance and re-request rather than storing a
 * refresh token, since re-running client credentials is a single cheap call.
 */
export async function waAdminToken(): Promise<AdminToken> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) return cachedToken;
  const c = waConfig();
  if (!c.apiKey) throw new WaError("Wild Apricot registration sync isn't configured.");

  const res = await fetch(`${c.oauthUrl}/auth/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`APIKEY:${c.apiKey}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({ grant_type: "client_credentials", scope: "auto" }),
    cache: "no-store",
  });
  if (!res.ok) {
    console.error("Wild Apricot API key token failed", res.status, await res.text().catch(() => ""));
    throw new WaApiError("Wild Apricot rejected the API key. Check WILDAPRICOT_API_KEY.", res.status, "/auth/token");
  }
  const body = (await res.json()) as { access_token?: string; expires_in?: number; Permissions?: { AccountId?: number }[] };
  const accountId = c.accountId || body.Permissions?.[0]?.AccountId;
  if (!body.access_token || !accountId) {
    throw new WaError("Wild Apricot returned an incomplete API token response.");
  }
  // Expire a minute early so a long sync doesn't start a request with a dying token.
  cachedToken = { token: body.access_token, accountId, expiresAt: Date.now() + ((body.expires_in ?? 1800) - 60) * 1000 };
  return cachedToken;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** One authenticated GET against /v2.2/accounts/<id>, retrying 401 once and backing off on 429/5xx. */
async function waApiGet<T>(path: string, query: Record<string, string | number> = {}, attempt = 0, retriedAuth = false): Promise<T> {
  const c = waConfig();
  const { token, accountId } = await waAdminToken();
  const params = new URLSearchParams(Object.entries(query).map(([k, v]) => [k, String(v)]));
  const qs = params.toString();
  const url = `${c.apiUrl}/v2.2/accounts/${accountId}${path}${qs ? `?${qs}` : ""}`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    cache: "no-store",
  });
  if (res.ok) return (await res.json()) as T;

  // A token that expired sooner than advertised: drop it and try once more.
  if (res.status === 401 && !retriedAuth) {
    clearTokenCache();
    return waApiGet<T>(path, query, attempt, true);
  }
  if ((res.status === 429 || res.status >= 500) && attempt < 2) {
    const retryAfter = Number(res.headers.get("retry-after"));
    await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 500 * 2 ** attempt);
    return waApiGet<T>(path, query, attempt + 1, retriedAuth);
  }
  console.error("Wild Apricot API request failed", res.status, path, await res.text().catch(() => ""));
  throw new WaApiError(
    res.status === 404 ? "Wild Apricot couldn't find that event." : "Wild Apricot couldn't be reached. Please try again.",
    res.status,
    path,
  );
}

/**
 * Pages a Wild Apricot list endpoint to completion.
 *
 * Throws rather than returning a short list when it runs past MAX_PAGES: a
 * silently truncated registration list looks exactly like "everyone cancelled",
 * which is the one input that could make the sync revoke access en masse.
 */
async function waListAll<T>(path: string, query: Record<string, string | number>, pick: (body: unknown) => T[]): Promise<T[]> {
  const out: T[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const body = await waApiGet<unknown>(path, { ...query, $top: PAGE_SIZE, $skip: page * PAGE_SIZE });
    const rows = pick(body);
    out.push(...rows);
    if (rows.length < PAGE_SIZE) return out;
  }
  throw new WaError(`Wild Apricot returned more than ${MAX_PAGES * PAGE_SIZE} rows for ${path}; refusing to use a partial list.`);
}

/**
 * Everyone a link covers, normalized so the sync doesn't care which kind it is.
 * Events supply a name and email from the registration; groups supply contact
 * ids only, so those get filled in by a follow-up contacts lookup.
 */
export type WaMember = {
  contactId: number | null;
  name: string;
  email: string | null;
  /** Events only — which registration granted it. */
  registrationId?: number;
  /** Raw Wild Apricot status string, kept verbatim since the enum isn't documented. */
  status?: string | null;
};

/** Wild Apricot wraps some collections in an object and returns others as a bare array. */
function rows(body: unknown, key: string): unknown[] {
  if (Array.isArray(body)) return body;
  if (body && typeof body === "object") {
    const wrapped = (body as Record<string, unknown>)[key];
    if (Array.isArray(wrapped)) return wrapped;
  }
  return [];
}

const asDate = (v: unknown) => {
  if (typeof v !== "string" || !v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

export type WaEventSummary = {
  id: number;
  name: string;
  location: string | null;
  startDate: Date | null;
  endDate: Date | null;
  registrationEnabled: boolean;
  registrationsLimit: number | null;
};

export type WaRegistration = {
  id: number;
  eventId: number;
  contactId: number | null;
  name: string;
  email: string | null;
  /** Raw Wild Apricot status string; the enum isn't documented, so it isn't narrowed here. */
  status: string | null;
  registrationType: string | null;
  isGuest: boolean;
  parentRegistrationId: number | null;
};

type RawEvent = {
  Id?: number;
  Name?: string;
  Location?: string;
  StartDate?: string;
  EndDate?: string;
  RegistrationEnabled?: boolean;
  RegistrationsLimit?: number | null;
};

function toEvent(raw: RawEvent): WaEventSummary | null {
  if (!raw?.Id) return null;
  return {
    id: raw.Id,
    name: raw.Name?.trim() || `Event ${raw.Id}`,
    location: raw.Location?.trim() || null,
    startDate: asDate(raw.StartDate),
    endDate: asDate(raw.EndDate),
    registrationEnabled: !!raw.RegistrationEnabled,
    registrationsLimit: typeof raw.RegistrationsLimit === "number" ? raw.RegistrationsLimit : null,
  };
}

type RawRegistration = {
  Id?: number;
  Event?: { Id?: number; Name?: string };
  Contact?: { Id?: number; Name?: string; Email?: string; FirstName?: string; LastName?: string };
  DisplayName?: string;
  Email?: string;
  RegistrationType?: { Name?: string } | null;
  Status?: string | null;
  IsGuestRegistration?: boolean;
  ParentRegistration?: { Id?: number } | null;
  RegistrationFields?: { FieldName?: string; SystemCode?: string; Value?: unknown }[];
};

/** Pulls an email out of the registration's custom fields when the Contact block has none. */
function emailFromFields(raw: RawRegistration): string | null {
  for (const f of raw.RegistrationFields ?? []) {
    if (f.SystemCode !== "Email" && !/e-?mail/i.test(f.FieldName ?? "")) continue;
    if (typeof f.Value === "string" && f.Value.includes("@")) return f.Value.trim().toLowerCase();
  }
  return null;
}

function toRegistration(raw: RawRegistration, fallbackEventId: number): WaRegistration | null {
  if (!raw?.Id) return null;
  const contact = raw.Contact ?? {};
  const email = (raw.Email ?? contact.Email ?? "").trim().toLowerCase() || emailFromFields(raw);
  const name =
    contact.Name?.trim() ||
    [contact.FirstName, contact.LastName].filter(Boolean).join(" ").trim() ||
    raw.DisplayName?.trim() ||
    email ||
    `Registration ${raw.Id}`;
  return {
    id: raw.Id,
    eventId: raw.Event?.Id ?? fallbackEventId,
    contactId: contact.Id ?? null,
    name,
    email: email || null,
    status: raw.Status ?? null,
    registrationType: raw.RegistrationType?.Name?.trim() || null,
    isGuest: !!raw.IsGuestRegistration,
    parentRegistrationId: raw.ParentRegistration?.Id ?? null,
  };
}

/** Events, for the admin event browser. `q` filters by name, `from` by end date. */
export async function waListEvents(opts: { q?: string; from?: Date } = {}): Promise<WaEventSummary[]> {
  const filters: string[] = [];
  if (opts.from) filters.push(`EndDate ge ${opts.from.toISOString().slice(0, 10)}`);
  if (opts.q?.trim()) filters.push(`substringof(Name, '${opts.q.trim().replace(/'/g, "''")}')`);
  const query: Record<string, string | number> = {};
  if (filters.length) query.$filter = filters.join(" AND ");

  const raw = await waListAll<RawEvent>("/events", query, (b) => rows(b, "Events") as RawEvent[]);
  return raw
    .map(toEvent)
    .filter((e): e is WaEventSummary => !!e)
    .sort((a, b) => (b.startDate?.getTime() ?? 0) - (a.startDate?.getTime() ?? 0));
}

/** One event, or null when Wild Apricot doesn't have it. Doubles as an API-key check. */
export async function waGetEvent(eventId: number): Promise<WaEventSummary | null> {
  try {
    const body = await waApiGet<RawEvent | RawEvent[]>(`/events/${eventId}`);
    return toEvent(Array.isArray(body) ? body[0] : body);
  } catch (e) {
    if (e instanceof WaApiError && e.status === 404) return null;
    throw e;
  }
}

/** Every registration for one event — the sync's workhorse (one call set per linked event). */
export async function waListEventRegistrations(eventId: number): Promise<WaRegistration[]> {
  const raw = await waListAll<RawRegistration>("/eventregistrations", { eventId }, (b) => rows(b, "EventRegistrations") as RawRegistration[]);
  return raw.map((r) => toRegistration(r, eventId)).filter((r): r is WaRegistration => !!r);
}

/** One contact's registrations across all events — used right after they sign in. */
export async function waListContactRegistrations(contactId: number): Promise<WaRegistration[]> {
  const raw = await waListAll<RawRegistration>("/eventregistrations", { contactId }, (b) => rows(b, "EventRegistrations") as RawRegistration[]);
  return raw.map((r) => toRegistration(r, 0)).filter((r): r is WaRegistration => !!r && r.eventId > 0);
}

export const registrationToMember = (r: WaRegistration): WaMember => ({
  contactId: r.contactId,
  name: r.name,
  email: r.email,
  registrationId: r.id,
  status: r.status,
});

// ─── Member groups ───────────────────────────────────────────────────────────

export type WaGroupSummary = { id: number; name: string; description: string | null; contactsCount: number | null };

type RawGroup = { Id?: number; Name?: string; Description?: string; ContactsCount?: number; ContactIds?: number[] };

/** Member groups, for the admin group picker. */
export async function waListMemberGroups(): Promise<WaGroupSummary[]> {
  const raw = await waListAll<RawGroup>("/membergroups", {}, (b) => rows(b, "MemberGroups") as RawGroup[]);
  return raw
    .filter((g) => !!g.Id)
    .map((g) => ({
      id: g.Id!,
      name: g.Name?.trim() || `Group ${g.Id}`,
      description: g.Description?.trim() || null,
      contactsCount: typeof g.ContactsCount === "number" ? g.ContactsCount : null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function waGetMemberGroup(groupId: number): Promise<WaGroupSummary | null> {
  try {
    const body = await waApiGet<RawGroup | RawGroup[]>(`/membergroups/${groupId}`, { includeArchivedMembers: "false" });
    const g = Array.isArray(body) ? body[0] : body;
    if (!g?.Id) return null;
    return {
      id: g.Id,
      name: g.Name?.trim() || `Group ${g.Id}`,
      description: g.Description?.trim() || null,
      contactsCount: g.ContactIds?.length ?? (typeof g.ContactsCount === "number" ? g.ContactsCount : null),
    };
  } catch (e) {
    if (e instanceof WaApiError && e.status === 404) return null;
    throw e;
  }
}

/**
 * A group's members. The group endpoint returns contact ids only, so names and
 * emails are filled in from a contacts lookup — without them, members who have
 * never linked their Wild Apricot account couldn't be matched by email.
 *
 * `includeArchivedMembers=false` matters: it defaults to true in Wild Apricot,
 * and archived contacts shouldn't be given course access.
 */
export async function waListGroupMembers(groupId: number): Promise<WaMember[]> {
  const body = await waApiGet<RawGroup | RawGroup[]>(`/membergroups/${groupId}`, { includeArchivedMembers: "false" });
  const group = Array.isArray(body) ? body[0] : body;
  const ids = (group?.ContactIds ?? []).filter((id): id is number => Number.isInteger(id));
  if (!ids.length) return [];
  const byId = await waContactsByIds(ids);
  // A contact we couldn't look up is still a member: keep it with the id alone
  // so it can be matched on waContactId, rather than dropping it silently.
  return ids.map((id) => byId.get(id) ?? { contactId: id, name: `Wild Apricot contact ${id}`, email: null });
}

// ─── Membership levels ───────────────────────────────────────────────────────

export type WaLevelSummary = { id: number; name: string; type: string | null };

type RawLevel = { Id?: number; Name?: string; Type?: string };

export async function waListMembershipLevels(): Promise<WaLevelSummary[]> {
  const raw = await waListAll<RawLevel>("/membershiplevels", {}, (b) => rows(b, "MembershipLevels") as RawLevel[]);
  return raw
    .filter((l) => !!l.Id)
    .map((l) => ({ id: l.Id!, name: l.Name?.trim() || `Level ${l.Id}`, type: l.Type?.trim() || null }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function waGetMembershipLevel(levelId: number): Promise<WaLevelSummary | null> {
  const all = await waListMembershipLevels();
  return all.find((l) => l.id === levelId) ?? null;
}

/**
 * Everyone currently holding a membership level.
 *
 * Membership status is filtered here rather than in the query: Wild Apricot's
 * contact filter syntax for status isn't documented clearly, whereas the
 * returned contact carries MembershipEnabled and Status, so we can be sure of
 * what we're reading. A lapsed member is excluded, which is what makes a level
 * a live entitlement.
 */
export async function waListLevelMembers(levelId: number): Promise<WaMember[]> {
  const contacts = await waContactsByFilter(`'Membership level ID' eq ${levelId}`);
  return contacts.filter((c) => c.enabled && !LAPSED_STATUSES.has((c.member.status ?? "").toLowerCase())).map((c) => c.member);
}

/** Wild Apricot contact statuses that mean the membership isn't currently live. */
const LAPSED_STATUSES = new Set(["lapsed", "pendingnew", "pending - new", "archived"]);

// ─── Contacts ────────────────────────────────────────────────────────────────

type RawContact = {
  Id?: number;
  Email?: string;
  FirstName?: string;
  LastName?: string;
  DisplayName?: string;
  Status?: string;
  MembershipEnabled?: boolean;
};

function toContact(raw: RawContact): { member: WaMember; enabled: boolean } | null {
  if (!raw?.Id) return null;
  const email = (raw.Email ?? "").trim().toLowerCase();
  return {
    member: {
      contactId: raw.Id,
      name: [raw.FirstName, raw.LastName].filter(Boolean).join(" ").trim() || raw.DisplayName?.trim() || email || `Contact ${raw.Id}`,
      email: email || null,
      status: raw.Status ?? null,
    },
    enabled: !!raw.MembershipEnabled,
  };
}

/** Contacts lookups are chunked: a huge `Id in (…)` filter would blow the URL length. */
const CONTACT_CHUNK = 50;

async function waContactsByIds(ids: number[]): Promise<Map<number, WaMember>> {
  const out = new Map<number, WaMember>();
  for (let i = 0; i < ids.length; i += CONTACT_CHUNK) {
    const chunk = ids.slice(i, i + CONTACT_CHUNK);
    try {
      for (const c of await waContactsByFilter(`Id in [${chunk.join(",")}]`)) {
        if (c.member.contactId) out.set(c.member.contactId, c.member);
      }
    } catch (e) {
      // Names and emails are a nicety here — contact ids alone still match
      // anyone who has linked their account, so don't fail the whole sync.
      console.error("Wild Apricot contact lookup failed", e);
    }
    if (i + CONTACT_CHUNK < ids.length) await sleep(100);
  }
  return out;
}

/**
 * Runs a contacts query, coping with Wild Apricot answering asynchronously.
 *
 * `$async=false` returns the list directly for small accounts, but Wild Apricot
 * may still hand back {State, ResultId} and expect to be polled, so both shapes
 * are handled.
 */
async function waContactsByFilter(filter: string): Promise<{ member: WaMember; enabled: boolean }[]> {
  type Body = { Contacts?: RawContact[]; State?: string; ResultId?: string };
  const first = await waApiGet<Body>("/contacts", { $filter: filter, $async: "false", $top: PAGE_SIZE, $skip: 0 });

  const collect = (b: Body) => rows(b, "Contacts") as RawContact[];
  let settled = first;
  if (first?.ResultId && first.State && first.State.toLowerCase() !== "complete") {
    settled = await waPollContacts(first.ResultId);
  }

  const out = collect(settled)
    .map(toContact)
    .filter((c): c is { member: WaMember; enabled: boolean } => !!c);
  // Page on only when the first page came back full and synchronously; an async
  // result is returned whole.
  if (!first?.ResultId && out.length === PAGE_SIZE) {
    for (let page = 1; page < MAX_PAGES; page++) {
      const body = await waApiGet<Body>("/contacts", { $filter: filter, $async: "false", $top: PAGE_SIZE, $skip: page * PAGE_SIZE });
      const more = collect(body)
        .map(toContact)
        .filter((c): c is { member: WaMember; enabled: boolean } => !!c);
      out.push(...more);
      if (more.length < PAGE_SIZE) return out;
    }
    throw new WaError("Wild Apricot returned more contacts than this sync will page through.");
  }
  return out;
}

async function waPollContacts(resultId: string) {
  type Body = { Contacts?: RawContact[]; State?: string; ResultId?: string };
  for (let attempt = 0; attempt < 10; attempt++) {
    await sleep(Math.min(500 * 2 ** attempt, 4000));
    const body = await waApiGet<Body>("/contacts", { resultId });
    if (!body?.State || body.State.toLowerCase() === "complete") return body;
  }
  throw new WaError("Wild Apricot is still preparing the contact list. Try the sync again in a minute.");
}

export { waAdminEnabled };
