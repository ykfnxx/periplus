# Periplus

[简体中文](./README.md) · [English](./README.en.md)

Periplus is a travel journal built around maps and photos. Each journey is one ordered event chain. Text, photos, receipts and locations belong directly to events; unknown dates, times and locations may remain empty.

## Features

- Browse photos on a map, pick locations, and read or edit a continuous journal.
- Add, edit and move entries, preserving photo captions and individual locations.
- Extract receipt fields with local PaddleOCR, then confirm edits and attach the fields and original image to an event.
- Invite friends to contribute. Event authors and attachment uploaders are tracked separately. Owners can organize the whole journal; friends edit their own contributions.
- Store journeys and immutable revisions in PostgreSQL, with version checks and idempotent request replay.
- Store private objects through OpenDAL and S3-compatible storage, checking access on every read.

## Setup

Use Node.js 22, PostgreSQL 15+, and a private S3-compatible bucket. Maps require an AMap JS API key. Place catalog import and enrichment scripts use an AMap Web Service key.

```bash
npm ci
cp .env.example .env.local
```

Configure the database, authentication, storage and map keys in `.env.local`. Only `NEXT_PUBLIC_*` values are browser-visible; private configuration is read through `config/periplus.server.ts`. Isolated development and tests can use `PERIPLUS_STORAGE_SCHEME="fs"` or process-local `"memory"` storage.

Initialize a fresh development database:

```bash
npx prisma generate
npx prisma migrate deploy
npm run db:seed
```

Seed requires an empty database. Schema changes update the development baseline directly, without old-data compatibility or migration.

Run the complete application only on the development server and connect Monitor before debugging. The Mac is limited to standalone Storybook and tests.

```bash
npm run dev
```

Next.js serves both the Web UI and product APIs on port 3001. Standalone Storybook uses port 6006.

## Receipt recognition and collaboration

Receipt images are read through OpenDAL and sent to local PaddleOCR. On Linux, install `ops/ocr/requirements.txt` in an isolated Python 3.11 environment, then run `ops/ocr/start.sh`. The first start downloads models. The default listener is `127.0.0.1:8106`. Set `PERIPLUS_OCR_URL=http://127.0.0.1:8106/ocr` for Web; when changing the OCR port, also set `PERIPLUS_OCR_PORT`.

Users confirm recognition results and can fill missing fields manually. Invitation links expire after seven days and can be listed or revoked by the owner. Signed-in friends can accept and contribute events, photos and receipts. Membership does not expose anyone's unshared media library.

## Resource API

`POST /api/assets` accepts a binary body with its MIME type in `Content-Type`. `X-Upload-Id` is a stable, user-scoped retry key; optional `X-File-Name` is URL-encoded. The response includes the resource ID, type, size and same-origin file URL. `/api/assets/:id/file` checks permissions and supports a single byte range. Deletion is soft; active event references prevent it.

## Commands

| Command                        | Purpose                          |
| ------------------------------ | -------------------------------- |
| `npm run dev`                  | Start Next.js                    |
| `npm run build` / `npm start`  | Build / run production Web       |
| `npm run storybook`            | Standalone component development |
| `npm run typecheck`            | TypeScript checks                |
| `npm run test:unit -- --run`   | Unit tests                       |
| `npm run places:import-mct-5a` | Import the place catalog         |
| `npm run places:enrich-mct-5a` | Enrich place data                |

## Structure

```text
app/                    Next.js pages and product APIs
modules/                Authentication, data, journal and map components
lib/                    Map, coordinate and place utilities
ops/ocr/                Local PaddleOCR configuration
prisma/                 Schema, development baseline and seed
scripts/                Place catalog maintenance
tests/                  Unit, Storybook and browser tests
```

Stack: Next.js 16, React 19, TypeScript, Tailwind CSS 4, Kumo, Zustand, Prisma, Better Auth, OpenDAL, Vitest, Storybook and Playwright.

## License

[MIT](./LICENSE) © 2026 ykfnxx
