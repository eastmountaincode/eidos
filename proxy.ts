import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { PORTAL_COOKIE_NAME, portalSessionSecret } from "@/lib/auth-values";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isAuthed = request.cookies.get(PORTAL_COOKIE_NAME)?.value === portalSessionSecret();

  if (pathname === "/login" || pathname === "/api/login") {
    if (isAuthed && pathname === "/login") {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return NextResponse.next();
  }

  if (pathname.startsWith("/_next") || pathname === "/favicon.ico") {
    return NextResponse.next();
  }

  if (!isAuthed) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
