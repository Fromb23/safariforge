# SafariForge

SafariForge is a shared safari journal with a desktop-only editorial studio. Admins manage independently publishable Safari Pages; visitors entering through one shared bearer link see every included published page in chronological order.

Each Safari Page is one atomic two-panel spread:

- A fixed left panel owns the hero, eyebrow, title, location, dates, crop, and overlay position.
- A flexible right panel owns ordered headings, subtitles, paragraphs, lists, facts, image grids, and carousels.

Page drafts and published snapshots are separate. Editing never changes the visible snapshot until that page is published again. Publishing one page does not affect another page.

## Private access model

Admin and visitor bearer links establish independent role sessions. Admin mutations require the admin session, matching CSRF cookie/header, and canonical origin. The visitor bearer is a shared access capability, not an identity and not a page assignment; its session can read the shared journal and only media referenced by included published pages. It can never authorize admin APIs.

Only keyed hashes of bearer tokens are stored. Responses use `private, no-store`, no indexing, and a no-referrer policy. Rotating one role invalidates only that role's sessions.

## Setup

Requirements: Node.js 24 or newer, npm, and Git LFS for the source-image archive.

```powershell
Copy-Item .env.example .env
npm ci --include=dev --no-audit --no-fund
npm run db:migrate
npm run access -- provision admin
npm run access -- provision traveler
npm run dev
```

The provisioning commands print each plaintext link once. Store them outside Git. Set `SHARED_VISITOR_LINK` to the printed traveler entry URL to enable the dashboard's Copy Shared Visitor Link action without rotating the credential.

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SITE_URL` | Exact canonical origin |
| `DATABASE_PATH` | Persistent SQLite file outside release directories |
| `MEDIA_STORAGE_DIR` | Persistent private media directory, never under `public/` |
| `SOURCE_IMAGE_ARCHIVE` | Development/demo source archive |
| `TOKEN_HASH_KEY` | At least 32 random characters |
| `SHARED_VISITOR_LINK` | Existing shared visitor bearer entry URL |
| `SESSION_HOURS` | Session lifetime, default 168 hours |
| `MAX_IMAGE_BYTES` | Upload limit, default 20 MB |

## Migration

`npm run db:migrate` is additive and idempotent. It retains legacy itinerary, revision, credential, session, template, and media tables, then creates Safari Page records from legacy sections while preserving stable section IDs where possible, editorial fields, media references, and old historical revisions.

- One legacy itinerary is imported into the shared journal automatically.
- If multiple legacy itineraries exist, all pages are preserved but default to excluded. An admin must explicitly include the desired pages, preventing an accidental public merge.
- Legacy `itinerary_id` columns remain for database compatibility but no longer determine visitor visibility.
- Published-revision media remains protected from deletion.

Before a production upgrade, back up the SQLite database and media directory together. Keep their configured paths unchanged, deploy the release, run only `npm run db:migrate`, inspect imported page inclusion in the admin studio, and then restart the service. Do not run `seed` or `images:import` against production.

## Demo assets

`npm run images:import` and `npm run seed` are development/demo operations. The seed retains the four presets Welcome, Trip Overview, Safari Day, and Lodge Stay. Presets initialize independent page instances and never carry publication state or media assignments.

## Link rotation

```powershell
npm run access -- rotate admin
npm run access -- rotate traveler
```

Update `SHARED_VISITOR_LINK` after rotating the traveler credential. Rotation does not publish, unpublish, or alter any Safari Page.

## Checks

```powershell
npm run lint
npm test
npm run build
```

`npm run test:e2e` is an HTTP/browser-session integration harness for an isolated disposable database. It verifies bearer exchange, role isolation, shared multi-page rendering, draft isolation, atomic publication, CSRF enforcement, and denial of visitor admin mutations. Never point it at production data.
