import { NextRequest, NextResponse } from "next/server";
export function proxy(request:NextRequest) {
  const response = NextResponse.next();
  const privateRoute=request.nextUrl.pathname.startsWith("/admin")||request.nextUrl.pathname.startsWith("/api/admin")||request.nextUrl.pathname.startsWith("/access");
  response.headers.set("Cache-Control",privateRoute?"private, no-store, max-age=0":"public, max-age=0, must-revalidate");if(privateRoute)response.headers.set("X-Robots-Tag","noindex, nofollow, noarchive");
  response.headers.set("Referrer-Policy", "no-referrer"); response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Content-Security-Policy", "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
  return response;
}
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
