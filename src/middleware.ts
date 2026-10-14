import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/session";

/** Sign-in pages: signed-in users are sent to the dashboard. */
const AUTH_PATHS = ["/login", "/signup"];
/** Pages anyone can see, signed in or not. */
const OPEN_PATHS = ["/directory", "/verify", "/api/cron", "/auth/wildapricot", "/p", "/files/portfolio", "/files/branding"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  const matches = (paths: string[]) => paths.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (matches(OPEN_PATHS)) return NextResponse.next();
  const isPublic = matches(AUTH_PATHS);

  if (!session && !isPublic) {
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const url = new URL("/login", req.url);
    if (pathname !== "/") url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  if (session && isPublic) return NextResponse.redirect(new URL("/dashboard", req.url));
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|manifest.webmanifest|.*\\.(?:png|jpg|svg|ico)$).*)"],
};
