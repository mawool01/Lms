import "server-only";

/**
 * Wild Apricot single sign-on (OAuth 2 "authorized application" with Wild Apricot login).
 *
 * Settings (Vercel environment variables):
 *   WILDAPRICOT_URL            your Wild Apricot site, e.g. https://iclca.wildapricot.org or https://www.iclca.org
 *   WILDAPRICOT_CLIENT_ID      from Settings → Integration → Authorized applications
 *   WILDAPRICOT_CLIENT_SECRET  from the same page
 * Optional overrides (only needed for testing): WILDAPRICOT_OAUTH_URL, WILDAPRICOT_API_URL.
 *
 * Reading event registrations (see wildapricot-admin.ts) is a separate, server-to-server
 * integration that needs only WILDAPRICOT_API_KEY — the two halves are independent.
 */
export const waConfig = () => ({
  siteUrl: (process.env.WILDAPRICOT_URL ?? "").replace(/\/$/, ""),
  clientId: process.env.WILDAPRICOT_CLIENT_ID ?? "",
  clientSecret: process.env.WILDAPRICOT_CLIENT_SECRET ?? "",
  oauthUrl: (process.env.WILDAPRICOT_OAUTH_URL ?? "https://oauth.wildapricot.org").replace(/\/$/, ""),
  apiUrl: (process.env.WILDAPRICOT_API_URL ?? "https://api.wildapricot.org").replace(/\/$/, ""),
  apiKey: process.env.WILDAPRICOT_API_KEY ?? "",
  // Only needed when one API key has permissions on more than one Wild Apricot account.
  accountId: Number(process.env.WILDAPRICOT_ACCOUNT_ID) || 0,
});

/** True when "Sign in with Wild Apricot" is configured. */
export const waEnabled = () => {
  const c = waConfig();
  return !!(c.siteUrl && c.clientId && c.clientSecret);
};

/** True when the server-to-server API key is configured (event registration sync). */
export const waAdminEnabled = () => !!waConfig().apiKey;

export const WA_SCOPE = "contacts_me";

/** Where to send the browser to log in on the Wild Apricot site. */
export function waAuthorizeUrl(redirectUri: string, state: string) {
  const c = waConfig();
  const params = new URLSearchParams({ client_id: c.clientId, redirect_uri: redirectUri, scope: WA_SCOPE, state });
  return `${c.siteUrl}/sys/login/OAuthLogin?${params}`;
}

export type WaContact = {
  id: number;
  accountId: number;
  email: string;
  firstName: string;
  lastName: string;
  displayName: string;
  organization: string | null;
  membershipLevel: string | null;
  membershipStatus: string | null;
  isMember: boolean;
  isAccountAdministrator: boolean;
};

export class WaError extends Error {}

/**
 * A WaError that also carries the HTTP status, so callers can tell "429, back off"
 * from "404, that event no longer exists". The message stays user-safe.
 */
export class WaApiError extends WaError {
  constructor(
    message: string,
    readonly status: number,
    readonly endpoint: string,
  ) {
    super(message);
  }
}

/** Exchanges the authorization code for a token and loads the signed-in contact. */
export async function waFetchContact(code: string, redirectUri: string): Promise<WaContact> {
  const c = waConfig();
  const tokenRes = await fetch(`${c.oauthUrl}/auth/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${c.clientId}:${c.clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({ grant_type: "authorization_code", code, client_id: c.clientId, redirect_uri: redirectUri, scope: WA_SCOPE }),
    cache: "no-store",
  });
  if (!tokenRes.ok) {
    console.error("Wild Apricot token exchange failed", tokenRes.status, await tokenRes.text().catch(() => ""));
    throw new WaError("Wild Apricot didn't accept the sign-in. Please try again.");
  }
  const token = (await tokenRes.json()) as { access_token?: string; Permissions?: { AccountId?: number }[] };
  const accountId = token.Permissions?.[0]?.AccountId;
  if (!token.access_token || !accountId) throw new WaError("Wild Apricot returned an incomplete sign-in response.");

  const meRes = await fetch(`${c.apiUrl}/v2.2/accounts/${accountId}/contacts/me`, {
    headers: { Authorization: `Bearer ${token.access_token}`, Accept: "application/json" },
    cache: "no-store",
  });
  if (!meRes.ok) {
    console.error("Wild Apricot contacts/me failed", meRes.status, await meRes.text().catch(() => ""));
    throw new WaError("Couldn't load your Wild Apricot profile. Please try again.");
  }
  const me = (await meRes.json()) as {
    Id: number;
    Email?: string;
    FirstName?: string;
    LastName?: string;
    DisplayName?: string;
    Organization?: string;
    MembershipLevel?: { Name?: string } | null;
    MembershipEnabled?: boolean;
    Status?: string;
    IsAccountAdministrator?: boolean;
  };
  if (!me.Id || !me.Email) throw new WaError("Your Wild Apricot profile has no email address. Please add one and try again.");
  return {
    id: me.Id,
    accountId,
    email: me.Email.trim().toLowerCase(),
    firstName: me.FirstName ?? "",
    lastName: me.LastName ?? "",
    displayName: me.DisplayName ?? "",
    organization: me.Organization?.trim() || null,
    membershipLevel: me.MembershipLevel?.Name ?? null,
    membershipStatus: me.Status ?? null,
    isMember: !!me.MembershipEnabled && !!me.MembershipLevel,
    isAccountAdministrator: !!me.IsAccountAdministrator,
  };
}

export function waDisplayName(c: WaContact) {
  return [c.firstName, c.lastName].filter(Boolean).join(" ").trim() || c.displayName || c.email.split("@")[0];
}
