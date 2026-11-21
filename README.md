# SafariForge

SafariForge is a private itinerary journal and instructor workspace built with Next.js App Router, Node's SQLite API, and persistent private filesystem media storage. It has no login, registration, public itinerary, or public media directory.

## Private access model

Two independent bearer links establish role-specific sessions:

- **Admin/instructor** exchanges once for an HttpOnly admin session, then redirects to `/admin`. Admin mutations require a matching CSRF cookie/header and the canonical origin.
- **Traveler** exchanges once for an HttpOnly traveler session, then redirects to `/trip`. The session is bound to an explicitly assigned itinerary and can read only that itinerary's active publication and referenced media.

Only an HMAC-SHA-256 hash of each bearer token is stored. Sessions record their credential version, so rotating one link invalidates that role's sessions without affecting the other role. Clean page and media URLs are not credentials. All private responses are `private, no-store`, deny indexing, and use a no-referrer policy.

Publishing validates and stores the exact editor document, promotes it, and creates a section-free editable successor in the same SQLite transaction. Saves and publishes use a monotonic revision version, so stale tabs receive a conflict instead of overwriting newer work. Existing traveler content remains unchanged during draft, template, and media metadata edits. Published revisions retain protected references to every media asset they use.

## PowerShell setup

Requirements: Node.js 24 or newer, npm, and Git LFS when cloning the tracked source-image archive. SQLite is built into Node; no separate database server is needed.

```powershell
Copy-Item .env.example .env
npm install
npm run db:migrate
npm run images:import
npm run seed
npm run access -- provision admin
npm run access -- provision traveler <itinerary-id-or-slug>
npm run dev
```

Replace every placeholder in `.env` first. Generate `TOKEN_HASH_KEY` without printing it to shared logs, for example:

```powershell
$bytes = New-Object byte[] 48
[Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
[Convert]::ToBase64String($bytes)
```

Store the result in the server-only `TOKEN_HASH_KEY`. The two provisioning commands print each plaintext link once. Save them in a password manager; never put them in Git, analytics, screenshots, client-prefixed environment variables, or proxy access logs.

### Environment variables

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SITE_URL` | Exact canonical origin, such as `https://journeys.example.com` |
| `DATABASE_PATH` | Persistent SQLite file outside release directories in production |
| `MEDIA_STORAGE_DIR` | Persistent private media directory; never place it under `public/` |
| `SOURCE_IMAGE_ARCHIVE` | Pristine 43-image source archive used by the importer |
| `TOKEN_HASH_KEY` | At least 32 random characters; changing it invalidates all tokens and sessions |
| `SESSION_HOURS` | Session lifetime; defaults to 168 hours |
| `MAX_IMAGE_BYTES` | Maximum uploaded source image size; defaults to 20 MB |

`.env`, SQLite files, runtime uploads, thumbnails, logs, and IDE metadata are ignored.

## Images and starter itinerary

[`assets/SafariForge-images.zip`](assets/SafariForge-images.zip) is the single pristine tracked copy of all 43 supplied originals and is stored through Git LFS to avoid a 115 MB ordinary Git blob. Do not extract another tracked copy. The importer streams every archive entry into `MEDIA_STORAGE_DIR`, keeps the original filename as metadata, detects the actual file signature, decodes with pixel limits, assigns useful Tanzania/location/wildlife tags, creates a generated storage key, and writes a separate WebP thumbnail. It is idempotent on original filename plus content hash.

```powershell
npm run images:import
npm run seed
```

The seed creates four reusable templates—Welcome, Trip Overview, Safari Day, and Lodge Stay—and a complete published northern Tanzania itinerary with a fresh editable draft. It uses the real imported media throughout heroes, grids, and galleries.

Starter import and seeding are development/demo operations; do not run them against an established production database. For production upgrades, keep `DATABASE_PATH` and `MEDIA_STORAGE_DIR` pointed at their existing persistent locations, back both up together, deploy the release, and run only `npm run db:migrate` before starting the application.

## Link rotation

Provision each role once. Rotate independently thereafter:

```powershell
npm run access -- rotate admin
npm run access -- rotate traveler <itinerary-id-or-slug>
```

Rotation increments only that credential version and deletes its existing sessions in one transaction. Share the replacement link out of band.

## Editor and publication workflow

The instructor workspace distinguishes:

- **Template:** reusable default block structure.
- **Itinerary section:** a stable-ID dated instance with title, location, hero, and ordered blocks.
- **Media asset:** reusable original plus derivative, tags, and alt text.

Sections and blocks have no hard-coded count. The editor supports headings, paragraphs, lists, structured facts, image grids, legacy galleries, and accessible ordered carousels. Media tags filter the library but never place photography; every hero and content image is stored as an explicit media ID. Draft preview and the traveler journal use the same renderer and chronological ordering (`startDate`, then administrative order). Stable IDs keep repeated lodge/destination names unambiguous.

Existing installations are migrated in place. The migration adds nullable itinerary assignments to credentials/sessions and a revision version counter. If an older database has exactly one published itinerary, the existing traveler credential and sessions are assigned to it for backward compatibility; otherwise an administrator must use **Assign traveler** in the dashboard or rotate the traveler link with an itinerary ID/slug.

## Checks

```powershell
npm run lint
npm test
npm run build
```

`scripts/verify-e2e.ts` is an internal verification harness for a disposable seeded database. It starts a hidden local production server, exercises both token exchanges and role boundaries, checks signed-out denial, media delivery, upload, draft isolation, publish promotion, and independent rotation, then stops its server. Set disposable `DATABASE_PATH` and `MEDIA_STORAGE_DIR` values before running it.

Production should terminate TLS at the reverse proxy, exclude query strings from access/APM logs, cap request bodies slightly above `MAX_IMAGE_BYTES`, and grant the service account access only to its SQLite and media paths.
