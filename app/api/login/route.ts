import { NextResponse } from "next/server";
import { PORTAL_COOKIE_NAME, portalPassword, portalSessionSecret } from "@/lib/auth";

export async function POST(request: Request) {
  const formData = await request.formData();
  const password = String(formData.get("password") || "");
  const url = new URL(request.url);

  if (password !== portalPassword()) {
    return NextResponse.redirect(new URL("/login?error=1", url), 303);
  }

  const response = NextResponse.redirect(new URL("/", url), 303);
  response.cookies.set(PORTAL_COOKIE_NAME, portalSessionSecret(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });

  return response;
}
