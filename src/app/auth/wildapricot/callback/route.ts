import { NextResponse, after, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { SESSION_COOKIE, SESSION_MAX_AGE, signSession, verifySession } from "@/lib/session";
import { WaError, waDisplayName, waEnabled, waFetchContact } from "@/lib/wildapricot";
import { syncWaEnrollments } from "@/lib/wildapricot-sync";

const STATE_COOKIE = "wa_oauth";

/** Sends the person back with a message: to the login page, or to their profile when connecting an account. */
function fail(req: NextRequest, message: string, linking = false) {
  const url = new URL(linking ? "/profile" : "/login", req.url);
  url.searchParams.set(linking ? "waerror" : "error", message);
  const res = NextResponse.redirect(url);
  res.cookies.delete({ name: STATE_COOKIE, path: "/auth/wildapricot" });
  return res;
}

/**
 * Wild Apricot redirects back here with ?code&state. We verify the state and
 * load the contact, then sign in the LMS account linked to that contact,
 * create a new account, or (from the Profile page) link the current account.
 */
export async function GET(req: NextRequest) {
  if (!waEnabled()) return fail(req, "Wild Apricot sign-in isn't configured.");
  const params = req.nextUrl.searchParams;
  let saved: { state?: string; next?: string; link?: string } = {};
  try {
    saved = JSON.parse(req.cookies.get(STATE_COOKIE)?.value ?? "{}");
  } catch {}
  if (params.get("error")) return fail(req, "Wild Apricot sign-in was cancelled.", !!saved.link);
  const code = params.get("code");
  if (!code || !saved.state || params.get("state") !== saved.state) return fail(req, "Your sign-in link expired. Please try again.");

  let contact;
  try {
    contact = await waFetchContact(code, `${req.nextUrl.origin}/auth/wildapricot/callback`);
  } catch (e) {
    return fail(req, e instanceof WaError ? e.message : "Wild Apricot sign-in failed. Please try again.", !!saved.link);
  }

  const membership = {
    waContactId: contact.id,
    waMembershipLevel: contact.membershipLevel,
    waMembershipStatus: contact.membershipStatus,
    waIsMember: contact.isMember,
    waSyncedAt: new Date(),
  };
  const adminRole = contact.isAccountAdministrator ? { role: "ADMIN" as const } : {}; // never demote automatically
  const linkedUser = await db.user.findUnique({ where: { waContactId: contact.id } });
  let user;

  if (saved.link) {
    // Connecting Wild Apricot to an account the person is already signed in to.
    const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
    if (session?.userId !== saved.link) return fail(req, "Please sign in again, then connect Wild Apricot from your profile.");
    if (linkedUser && linkedUser.id !== saved.link) return fail(req, "That Wild Apricot profile is already connected to another LMS account.", true);
    user = await db.user.update({ where: { id: saved.link }, data: { ...membership, ...adminRole } });
  } else if (linkedUser) {
    if (!linkedUser.active) return fail(req, "This account has been deactivated. Contact an ICLCA administrator.");
    user = await db.user.update({
      where: { id: linkedUser.id },
      data: { ...membership, ...adminRole, ...(!linkedUser.institution && contact.organization ? { institution: contact.organization } : {}) },
    });
  } else if (await db.user.findUnique({ where: { email: contact.email } })) {
    // Never take over an existing account just because the email matches: the owner must prove they hold both.
    return fail(
      req,
      "You already have an LMS account with this email. Sign in with your email and password once, then choose “Connect Wild Apricot” on your Profile page.",
    );
  } else {
    user = await db.user.create({
      data: {
        ...membership,
        email: contact.email,
        name: waDisplayName(contact),
        passwordHash: null,
        role: contact.isAccountAdministrator ? "ADMIN" : "STUDENT",
        institution: contact.organization,
      },
    });
  }

  const next = saved.link ? "/profile?wa=connected" : saved.next && saved.next.startsWith("/") && !saved.next.startsWith("//") ? saved.next : "/dashboard";
  const res = NextResponse.redirect(new URL(next, req.url));
  res.cookies.set(SESSION_COOKIE, await signSession({ userId: user.id }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  res.cookies.delete({ name: STATE_COOKIE, path: "/auth/wildapricot" });

  // Enroll them in courses linked to Wild Apricot events they're registered for.
  // after() runs once the redirect has been sent, so a slow or broken Wild Apricot
  // can never delay or fail the sign-in itself. Grants only: removing access is the
  // nightly job's business, since one contact's registrations aren't enough to
  // conclude anyone else's have gone.
  after(async () => {
    try {
      await syncWaEnrollments({ trigger: "SIGN_IN", waContactId: contact.id, allowRevoke: false });
    } catch (e) {
      console.error("Wild Apricot enrollment sync after sign-in failed", e);
    }
  });
  return res;
}
