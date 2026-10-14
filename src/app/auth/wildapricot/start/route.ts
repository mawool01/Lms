import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/session";
import { waAuthorizeUrl, waEnabled } from "@/lib/wildapricot";

/**
 * Starts "Sign in with Wild Apricot": remembers a random state and sends the browser to Wild Apricot.
 * With ?link=1 (from the Profile page) it connects Wild Apricot to the signed-in account instead.
 */
export async function GET(req: NextRequest) {
  if (!waEnabled()) return NextResponse.redirect(new URL("/login?error=" + encodeURIComponent("Wild Apricot sign-in isn't configured."), req.url));
  const params = req.nextUrl.searchParams;
  let link: string | undefined;
  if (params.get("link") === "1") {
    const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
    if (!session) return NextResponse.redirect(new URL("/login?next=/profile", req.url));
    link = session.userId;
  }
  const nextParam = params.get("next") ?? "";
  const next = link ? "/profile" : nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/dashboard";
  const state = crypto.randomUUID();
  const res = NextResponse.redirect(waAuthorizeUrl(`${req.nextUrl.origin}/auth/wildapricot/callback`, state));
  res.cookies.set("wa_oauth", JSON.stringify({ state, next, link }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/auth/wildapricot",
    maxAge: 600,
  });
  return res;
}
