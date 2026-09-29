# Choose Me Beauty Parlor

A complete local full-stack website for **Choose Me Makeup Studio & Academy**, owned by Ritima Silwal in Dhulabari, Nepal.

## Open the website

On this Mac, double-click **Start Website.command**. Keep its Terminal window open while using the site.

- Website: http://localhost:3000
- Admin: http://localhost:3000/admin
- Private initial login: **ADMIN-ACCESS.txt** (generated on first start; do not share it)

The project includes the complete frontend, backend, generated brand images, built website, persistent SQLite database, tests and configuration. It is a local project; it has not been published to the internet.

## Run on another computer

Install **Node.js 24 LTS or later**. From this folder:

```sh
npm install
npm run build
npm start
```

For reproducible installs with the included lockfile, use pnpm 11.25.0:

```sh
corepack enable
corepack prepare pnpm@11.25.0 --activate
pnpm install --frozen-lockfile
pnpm build
pnpm start
```

For development with frontend hot reload: `npm run dev`. Restart after backend code changes.

Optional configuration: copy `.env.example` to `.env`. Keep `APP_ORIGIN` equal to the browser URL, including the port. Start from this project directory so relative paths resolve correctly.

## Admin guide

1. Sign in at `/admin` using the private access file.
2. Open **Services**. **Add service** creates a new entry; the pencil edits it.
3. **Hide** removes a service from the public menu and enquiry selector while preserving its details. Use **Publish** to restore it.
4. **Delete** permanently removes the service after a confirmation dialog. Past enquiries retain the service name so their history remains useful.
5. Set display order, description, category, optional price, optional duration, icon and optional service photo.
6. Use **Academy**, **Gallery**, **TikTok videos**, and **Testimonials** to manage those sections. Each supports add, edit, publish/hide and delete.
7. **Gallery** accepts uploaded JPG, PNG, WebP and AVIF photos up to 8 MB. Photos are validated, resized, stripped of metadata, and stored as WebP on your server. Service and studio photos support the same upload flow.
8. For TikTok, open the video in a browser and copy the full URL, e.g. `https://www.tiktok.com/@account/video/123456789`. Short share links need to be opened first. Videos use the official TikTok player, load when a visitor chooses Play, and offer a direct fallback link. TikTok must permit playback of that video; private/deleted/region-blocked videos may not play.
9. **Enquiries** holds real website submissions. Call the client and update the enquiry to contacted, confirmed, completed or cancelled. These changes do not send a message to the client.
10. **Studio settings** edits business details, homepage text and photos, owner portrait, WhatsApp availability and social/map links.
11. **Account & password** changes your password. Use at least 12 characters. Changing it signs out other active sessions.

If you forget the admin password, run `npm run admin:reset`. A new random password is saved to `ADMIN-ACCESS.txt`, and all sessions are revoked. The admin email defaults to `admin@chooseme.local`; set `ADMIN_EMAIL` before first startup or reset to use another email.

## What needs your real content

- Actual studio portfolio photos, genuine client reviews and TikTok video links.
- Ritima's real portrait if desired. Until then, the founder section uses a typographic monogram.
- Real Instagram/Facebook/TikTok profile URLs and verified Google Maps listing.
- Confirm WhatsApp availability before enabling that button.
- Prices and durations, if you want them displayed.

Gallery, video and review records start empty; no invented reviews or fake portfolio work are published. The public site includes original AI-generated campaign imagery, identified as editorial inspiration. Generation prompts and provenance are in `docs/IMAGE-ASSETS.md`.

## Included functionality

- React + TypeScript responsive frontend and distinct responsive admin dashboard.
- Node.js / Express backend with a real persistent SQLite database.
- All 12 requested services and 5 academy courses seeded once.
- Service category filtering, course enquiries, accessible image lightbox and swipeable videos.
- Appointment enquiry form, persistent admin inbox and enquiry status management.
- Password hashing with salted scrypt, random database-backed sessions, HttpOnly SameSite cookies, CSRF validation, same-origin mutations and rate limiting.
- Validated JSON inputs, parameterized queries, protected uploads and security headers.
- Server-rendered page metadata and BeautySalon structured data; sitemap and robots routes; admin noindex.
- Generated, optimized local WebP assets; no runtime image-generation API required.
- Optional feature-detected WebMCP read tool for published services; browsers without that experimental API use the normal UI.

Appointments are **requests**, not automatically confirmed bookings. No calendar availability, payments, email or SMS provider is connected. The contact form is fully functional through the admin inbox.

## Source structure

```text
frontend/src/public.tsx       Public site and enquiry form
frontend/src/admin.tsx        Login, dashboard and content management
frontend/src/components.tsx   Accessible dialogs and shared UI
frontend/src/styles.css       Public design and responsive styles
frontend/src/admin.css        Admin design and responsive styles
frontend/public/images/      Local campaign imagery
backend/index.mjs            Server startup, frontend hosting and metadata
backend/app.mjs              JSON API, auth guards, uploads and error handling
backend/database.mjs         Versioned SQLite schema and persistence
backend/security.mjs         Password hashing, sessions and rate limits
backend/validation.mjs       Server-side field validation
backend/seed.mjs             Initial studio information and services
scripts/                     Password recovery and backups
tests/api.test.mjs           Integration tests using an isolated temporary DB
data/                        Private runtime database and uploaded photos
dist/                        Built frontend (regenerate with npm run build)
```

See `docs/API.md` for endpoint details.

## Backups

Run `npm run backup`. The script uses SQLite's live backup API and copies uploads to a timestamped folder in `backups/`. Pause editing/uploading photos while taking a backup for a consistent file set. Keep copies somewhere separate from this computer.

Restore: stop the server, preserve the current `data/` folder separately, then copy a backup's `chooseme.sqlite` and `uploads/` into a fresh `data/` folder. Restart the server. Never merge a restored database with old SQLite WAL/SHM files.

Deleting content removes the database record. Uploaded files are retained so deleting one record cannot break another record that uses the same photo. Backups and uploaded photos should be managed with the same care as client contact details.

## Hosting

Deploy to a **single Node.js 24+ server with a persistent disk**. Store `data/` outside ephemeral build directories. This SQLite version is not designed for stateless serverless functions or multiple replicas sharing a network-mounted database.

Set `HOST=0.0.0.0`, `APP_ORIGIN=https://your-domain.example`, and `COOKIE_SECURE=true` behind an HTTPS reverse proxy. Never serve the project root as static files; Express serves only the built frontend and public image uploads. Keep the database, access file and backups private.

The included Dockerfile and compose file mount a persistent volume. To expose beyond your machine, configure your HTTPS reverse proxy and update the public origin. The default Compose configuration binds only to localhost.

No proxy IP headers are trusted by default. Behind a reverse proxy, rate limits are shared by users arriving through that proxy unless you configure a verified trusted proxy boundary in Express. Do not blindly trust client-supplied IP headers.

## Verification

```sh
npm test
npm run build
```

Integration tests cover authentication, CSRF, origin checks, service add/edit/hide/publish/delete, persistence, input validation, enquiries, uploads, password changes, logout and login rate limits. Test data is isolated from your studio database.
