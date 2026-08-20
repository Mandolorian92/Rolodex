/**
 * Route protection for the multi-tenant app — runs before every request (Node.js runtime by
 * default as of Next.js 16, so the Prisma-backed database session lookup in auth() works
 * here, unlike the old Edge-only middleware). This is an optimistic first line of defense,
 * not the whole story: every page/API route still does its own requireUserId()/
 * getSessionUserId() scoping (see src/lib/session.ts) since Next's own guidance is not to
 * rely on proxy alone for authorization.
 */
import { NextResponse } from "next/server";
import { auth } from "@/auth";

const PUBLIC_PATHS = new Set(["/sign-in", "/onboarding"]);
// Cron-triggered (CRON_SECRET bearer auth, not a session) and Auth.js's own endpoints.
const PUBLIC_API_PREFIXES = ["/api/auth", "/api/sync", "/api/stock-watch/check"];

export default auth((req) => {
  const { pathname } = req.nextUrl;

  if (PUBLIC_PATHS.has(pathname) || PUBLIC_API_PREFIXES.some((p) => pathname.startsWith(p))) {
    return;
  }
  if (req.auth?.user?.id) return;

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  return NextResponse.redirect(new URL("/sign-in", req.nextUrl.origin));
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
