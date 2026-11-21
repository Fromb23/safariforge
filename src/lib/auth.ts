import { cookies } from "next/headers";
import { db } from "./db";
import { config } from "./config";
import { CSRF_COOKIE, csrfForSession, randomToken, safeEqual, secretHash, SESSION_COOKIES, sessionIsCurrent } from "./auth-core";
import type { Role } from "@/types";

type Credential = { role: Role; token_hash: string; version: number };
export type Session = { id: string; role: Role; credential_version: number; expires_at: string; csrf_hash: string };
export async function exchangeToken(role: Role, token: string) {
  if (token.length < 40) return null;
  const credential = db().prepare("SELECT role, token_hash, version FROM credentials WHERE role = ?").get(role) as Credential | undefined;
  if (!credential || !safeEqual(credential.token_hash, secretHash(token))) return null;
  const id = randomToken(18); const sessionToken = randomToken(); const csrfToken = csrfForSession(id);
  const expiresAt = new Date(Date.now() + config.sessionHours * 3_600_000).toISOString();
  db().prepare("INSERT INTO sessions (id, session_hash, csrf_hash, role, credential_version, expires_at) VALUES (?, ?, ?, ?, ?, ?)")
    .run(id, secretHash(sessionToken), secretHash(csrfToken), role, credential.version, expiresAt);
  return { sessionToken, csrfToken, expiresAt };
}
export async function getSession(role?: Role): Promise<Session | null> {
  const store = await cookies(); const roles: Role[] = role ? [role] : ["ADMIN", "TRAVELER"];
  for (const candidate of roles) {
    const token = store.get(SESSION_COOKIES[candidate])?.value; if (!token) continue;
    const row = db().prepare(`SELECT s.*, c.version, c.role credential_role FROM sessions s JOIN credentials c ON c.role=s.role WHERE s.session_hash=?`).get(secretHash(token)) as (Session & { version: number; credential_role: Role }) | undefined;
    if (row && sessionIsCurrent(row, { role: row.credential_role, version: row.version }) && (!role || row.role === role)) return row;
  }
  return null;
}
export async function requireSession(role: Role) {
  const session = await getSession(role); if (!session) throw new Error("PRIVATE_ACCESS_REQUIRED"); return session;
}
export async function requireAdminMutation(request: Request) {
  const session = await requireSession("ADMIN"); const store = await cookies();
  const cookieToken = store.get(CSRF_COOKIE)?.value || ""; const headerToken = request.headers.get("x-csrf-token") || "";
  if (!cookieToken || cookieToken !== headerToken || !safeEqual(session.csrf_hash, secretHash(headerToken))) throw new Error("CSRF_INVALID");
  if (request.headers.get("origin") !== new URL(config.siteUrl).origin) throw new Error("CROSS_ORIGIN");
  return session;
}
export function cookieOptions(expiresAt: string, httpOnly: boolean) {
  return { httpOnly, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/", expires: new Date(expiresAt) };
}
export { CSRF_COOKIE, SESSION_COOKIES } from "./auth-core";
