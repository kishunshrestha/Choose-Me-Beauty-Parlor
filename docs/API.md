# JSON API

Same-origin API under `/api`. Mutations accept JSON except image uploads. Errors return `{ "error": "Readable explanation" }` with a relevant HTTP status. Public responses and private data use `Cache-Control: no-store`.

## Public

| Method | Path | Behavior |
|---|---|---|
| GET | `/api/health` | Server health |
| GET | `/api/site` | Settings plus published services, courses, gallery, TikTok and reviews |
| POST | `/api/enquiries` | Save an enquiry with name, phone, preferredDate, message and optional serviceId or courseId |
| POST | `/api/login` | Email/password sign-in; sets session cookie and returns CSRF token |

## Admin

All require a valid HttpOnly session cookie. Every mutation also requires `X-CSRF-Token` from the login/session response. The backend validates Origin when present and rejects unknown origins. No cross-origin CORS access is enabled.

| Method | Path | Behavior |
|---|---|---|
| GET | `/api/admin/session` | Email and current CSRF token |
| POST | `/api/admin/logout` | Revoke session |
| POST | `/api/admin/password` | Change using currentPassword/newPassword |
| GET | `/api/admin/overview` | Studio counts and recent enquiries |
| GET / PUT | `/api/admin/settings` | Read/replace validated studio settings |
| GET | `/api/admin/content/:kind` | All records, including hidden |
| POST | `/api/admin/content/:kind` | Create a record |
| PUT | `/api/admin/content/:kind/:id` | Update a record |
| PATCH | `/api/admin/content/:kind/:id/visibility` | Set `{ "visible": false }` or true |
| DELETE | `/api/admin/content/:kind/:id` | Permanent deletion |
| POST | `/api/admin/upload` | Multipart `image`; returns public `/uploads/…webp` URL |
| GET | `/api/admin/enquiries` | All client enquiries |
| PATCH | `/api/admin/enquiries/:id` | Update status |
| DELETE | `/api/admin/enquiries/:id` | Permanently delete client enquiry |

`kind` is `services`, `courses`, `gallery`, `tiktok` or `testimonials`. Full field definitions are in `backend/validation.mjs`.

Sessions last eight hours and are stored as SHA-256 token hashes. Password changes revoke other sessions; password recovery revokes all sessions. Login is limited to 10 attempts per 15 minutes per source IP, enquiries to 6 per 10 minutes, and password changes to 8 per 15 minutes.
