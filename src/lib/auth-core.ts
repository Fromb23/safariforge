import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { tokenKey } from "./config";
import type { Role } from "@/types";

export const SESSION_COOKIES: Record<Role, string> = { ADMIN: "safariforge_admin", TRAVELER: "safariforge_traveler" };
export const CSRF_COOKIE = "safariforge_admin_csrf";
export function secretHash(value: string) { return createHmac("sha256", tokenKey()).update(value).digest("hex"); }
export function safeEqual(left: string, right: string) {
  const a = Buffer.from(left, "hex"); const b = Buffer.from(right, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}
export function randomToken(bytes = 32) { return randomBytes(bytes).toString("base64url"); }
export function csrfForSession(id: string) { return createHmac("sha256", tokenKey()).update(`safariforge-csrf-v1\0${id}`).digest("base64url"); }
export function sessionIsCurrent(session: { role: Role; credential_version: number; expires_at: string }, credential: { role: Role; version: number }, now = new Date()) {
  return session.role === credential.role && session.credential_version === credential.version && new Date(session.expires_at) > now;
}
