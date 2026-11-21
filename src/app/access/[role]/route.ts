import { NextResponse } from "next/server";
import { cookieOptions, CSRF_COOKIE, exchangeToken, SESSION_COOKIES } from "@/lib/auth";
import { config } from "@/lib/config";
import type { Role } from "@/types";
export const dynamic = "force-dynamic";
export async function GET(request: Request, { params }: { params: Promise<{ role: string }> }) {
  const { role: value } = await params; if(value==="traveler")return NextResponse.redirect(new URL("/",config.siteUrl),303);const role: Role | null = value === "admin" ? "ADMIN" : null;
  const destination = role === "ADMIN" ? "/admin" : "/";
  if (!role) return NextResponse.redirect(new URL("/", config.siteUrl), 303);
  const session = await exchangeToken(role, new URL(request.url).searchParams.get("token") || "");
  if (!session) return NextResponse.redirect(new URL("/admin", config.siteUrl), 303);
  const response = NextResponse.redirect(new URL(destination, config.siteUrl), 303); response.headers.set("Cache-Control", "private, no-store");
  response.cookies.set(SESSION_COOKIES[role], session.sessionToken, cookieOptions(session.expiresAt, true));
  if (role === "ADMIN") response.cookies.set(CSRF_COOKIE, session.csrfToken, cookieOptions(session.expiresAt, false));
  return response;
}
