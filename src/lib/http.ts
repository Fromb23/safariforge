import { NextResponse } from "next/server";
const privateHeaders = { "Cache-Control": "private, no-store, max-age=0", "X-Robots-Tag": "noindex, nofollow, noarchive" };
export function privateJson(body: unknown, init: ResponseInit = {}) {
  const response = NextResponse.json(body, init); Object.entries(privateHeaders).forEach(([key, value]) => response.headers.set(key, value)); return response;
}
export function apiError(error: unknown) {
  const code = error instanceof Error ? error.message : "UNKNOWN";
  if (code === "PRIVATE_ACCESS_REQUIRED") return privateJson({ error: "Your private access has expired. Reopen your access link.", code }, { status: 401 });
  if (code === "CSRF_INVALID" || code === "CROSS_ORIGIN") return privateJson({ error: "The security check failed. Refresh and try again.", code }, { status: 403 });
  if (error instanceof Error && error.name === "DocumentConflictError") return privateJson({ error: error.message, code: "REVISION_CONFLICT" }, { status: 409 });
  if (error instanceof Error && /required|not found|before publishing|needs at least|references media|cannot be deleted|invalid content|ordered list/i.test(error.message)) return privateJson({ error: error.message }, { status: 400 });
  console.error(error); return privateJson({ error: "The request could not be completed." }, { status: 500 });
}
