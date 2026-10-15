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

export { waAdminEnabled };
