# SafariForge

SafariForge is one public, chronological safari journal with a separately authenticated, desktop-only editorial studio. Admins manage independently publishable Safari Pages; every visitor reads the same journal at `/` without a login, token, assignment, or invitation link.

Each Safari Page is one atomic two-panel spread:

- The fixed left panel owns the hero, eyebrow, title, location, dates, crop, and four-corner overlay position.
- The flexible right panel owns ordered headings, subtitles, paragraphs, lists, facts, historical image grids, and preferred carousels.

Page drafts and published snapshots are separate. Editing never changes visitor content until that page is published again. Publishing one page does not replace another page.

## Access and security

Only the Admin Studio uses a bearer link and admin session. Admin mutations require the admin session, matching CSRF cookie/header, and canonical origin. The public journal reads only pages that have an active published revision and are included in the journal. Public media authorization is checked against those same active revisions; draft, retired, unpublished, and excluded media is not exposed.

Legacy traveler credentials and sessions remain in SQLite for a safe transition but are no longer accepted, provisioned, assigned, or required. `/access/traveler` and `/trip` safely redirect to `/`. Legacy itinerary and revision records remain available to the explicit migration routine but their old administrative endpoints have been retired.

## Setup

Requirements: Node.js 24 or newer, npm, and Git LFS for the optional source-image archive.

```powershell
Copy-Item .env.example .env
npm ci --include=dev --no-audit --no-fund
npm run db:migrate
npm run access -- provision admin
npm run dev
```

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SITE_URL` | Exact canonical origin |
| `DATABASE_PATH` | Persistent SQLite file outside release directories |
| `MEDIA_STORAGE_DIR` | Persistent private media directory, never under `public/` |
| `SOURCE_IMAGE_ARCHIVE` | Development/demo source archive |
| `TOKEN_HASH_KEY` | At least 32 random characters |
| `SESSION_HOURS` | Admin session lifetime, default 168 hours |
| `MAX_IMAGE_BYTES` | Upload limit, default 20 MB |

`SHARED_VISITOR_LINK` is obsolete and may be removed from production configuration. No new variable is required for public access.

## Migration and production deployment

`npm run db:migrate` is the only schema/content migration entry point. It is additive and idempotent. Ordinary application reads do not create schema or import content. The migration retains legacy itinerary, revision, credential, session, template, media, Safari Page, draft, and publication history records.

- One legacy itinerary is imported into the shared journal automatically.
- If multiple legacy itineraries exist, all pages are preserved but default to excluded. An admin must explicitly include intended pages, preventing an accidental public merge.
- Legacy traveler credential/session rows remain for compatibility and recovery; they are inert.
- Published and historical revision media remains protected from deletion.

Production deployment is intentionally manual:

1. Back up the configured SQLite database, including `-wal`/`-shm` files when present, and the entire media directory as one consistent backup.
2. Fetch the release commit on the production host and install with `npm ci --omit=dev --no-audit --no-fund`.
3. Keep `DATABASE_PATH`, `MEDIA_STORAGE_DIR`, `NEXT_PUBLIC_SITE_URL`, `TOKEN_HASH_KEY`, `SESSION_HOURS`, and `MAX_IMAGE_BYTES` unchanged.
4. Run `npm run db:migrate` exactly once; rerunning is safe.
5. Do **not** run `seed` or `images:import` in production.
6. Restart the existing Next.js service.
7. In a clean browser, verify `/` without cookies, verify `/admin` still requires the admin link, inspect page inclusion, and test one published media URL plus one draft-only media URL.

Rollback uses the pre-deployment database and media backup together with the previous application release. No deployment is performed by this repository workflow.

## Demo assets

`npm run images:import` and `npm run seed` are development/demo operations only. The seed retains the four presets Welcome, Trip Overview, Safari Day, and Lodge Stay. Presets initialize independent page instances and never carry publication state or media assignments.

## Admin link rotation

```powershell
npm run access -- rotate admin
```

## Checks

```powershell
npm ci --include=dev --no-audit --no-fund
npm run lint
npm test
npm run build
npm run test:e2e
```

`test:e2e` is an HTTP integration harness for an isolated disposable database. Never point it at production data.
