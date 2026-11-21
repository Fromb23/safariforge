import { describe,expect,it } from "vitest";
import { secretHash,safeEqual,sessionIsCurrent } from "@/lib/auth-core";

describe("private access primitives",()=>{
  it("stores deterministic keyed hashes instead of live bearer tokens",()=>{const token="a-secret-link-token";const hash=secretHash(token);expect(hash).not.toContain(token);expect(hash).toMatch(/^[a-f0-9]{64}$/);expect(safeEqual(hash,secretHash(token))).toBe(true);expect(safeEqual(hash,secretHash("different"))).toBe(false)});
  it("invalidates a session when only its credential version rotates",()=>{const session={role:"ADMIN" as const,credential_version:2,expires_at:new Date(Date.now()+60_000).toISOString()};expect(sessionIsCurrent(session,{role:"ADMIN",version:2})).toBe(true);expect(sessionIsCurrent(session,{role:"ADMIN",version:3})).toBe(false)});
  it("rejects expired and cross-role sessions",()=>{expect(sessionIsCurrent({role:"TRAVELER",credential_version:1,expires_at:new Date(Date.now()-1).toISOString()},{role:"TRAVELER",version:1})).toBe(false);expect(sessionIsCurrent({role:"TRAVELER",credential_version:1,expires_at:new Date(Date.now()+60_000).toISOString()},{role:"ADMIN",version:1})).toBe(false)});
});
