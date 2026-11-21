import path from "node:path";

function absolute(value: string | undefined, fallback: string) {
  return path.resolve(value || fallback);
}

export const config = {
  databasePath: absolute(process.env.DATABASE_PATH, "./runtime/safariforge.sqlite"),
  mediaDir: absolute(process.env.MEDIA_STORAGE_DIR, "./runtime/media"),
  sourceArchive: absolute(process.env.SOURCE_IMAGE_ARCHIVE, "./assets/SafariForge-images.zip"),
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000",
  sessionHours: Number(process.env.SESSION_HOURS || 168),
  maxImageBytes: Number(process.env.MAX_IMAGE_BYTES || 20_000_000),
};

export function tokenKey() {
  const key = process.env.TOKEN_HASH_KEY;
  if (!key || key.length < 32) throw new Error("TOKEN_HASH_KEY must contain at least 32 characters.");
  return key;
}
