# BuildRootz

Full-stack application with Next.js frontend and Node.js Express backend.

## Tech Stack

- **Frontend**: Next.js, TypeScript, CSS modules + global styles (no Tailwind), Auth.js (NextAuth), Mapbox
- **Backend**: Node.js, Express, MongoDB Atlas (with local MongoDB Memory Server for testing), Mongoose, Redis
- **Infrastructure**: Cloudflare for domain, AWS for hosting

## Setup

### Prerequisites

- Node.js
- npm
- Local MongoDB (for production, use MongoDB Atlas)
- Redis

### Installation

1. Clone the repository.
2. Install dependencies:

```bash
cd frontend
npm install

cd ../backend
npm install
```

### Running the Application

#### One-command dev (frontend + backend)
From the repository root:
```bash
npm install      # only needed once
npm start
```
This runs the Next.js dev server and the Express API together.

#### Frontend
```bash
cd frontend
npm run dev
```
Open [http://localhost:3000](http://localhost:3000)

#### Backend
```bash
cd backend
npm start
```
Server runs on [http://localhost:3001](http://localhost:3001)

### Building for Production

#### Frontend
```bash
cd frontend
npm run build
npm start
```

#### Backend
```bash
cd backend
npm start
```

## Project Structure

- `frontend/` - Next.js application
- `backend/` - Express server
- `services/` - shared KeepUP snapshot client/cache/mapper
- `.github/` - GitHub configuration

## Notes

- For local MongoDB testing, MongoDB Memory Server is used.
- Configure Auth.js providers in frontend.
- Set up Mapbox access token.
- For production, use MongoDB Atlas and configure Redis.

## Auth + saved data API

- Backend uses JWT stored in an httpOnly cookie (`br_session` by default) with `sameSite=lax` and `secure` enabled in production.
- Key env vars: `JWT_SECRET` (required), `CLIENT_ORIGIN` (frontend origin, defaults to http://localhost:3000; comma-separate for multiple like `http://localhost:3000,http://localhost:3002`), `SESSION_COOKIE_NAME`, `SESSION_TTL_DAYS`, `SESSION_SAMESITE`.
- Frontend env: `NEXT_PUBLIC_API_BASE_URL` (defaults to http://localhost:3001).
- Alerts / email (optional): `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` (or `EMAIL_FROM`), `ALERT_CRON` (default `0 9 * * *`), `ENABLE_ALERT_CRON` (set to `false` to disable).
- API routes (port 3001):
  - `POST /api/auth/register` and `POST /api/auth/login` (accept optional `savedListingIds` to merge anonymous favorites)
  - `POST /api/auth/logout`
  - `GET /api/me` (user + saved counts)
  - `GET/POST/DELETE /api/me/saved-homes`
  - `GET/POST/DELETE /api/me/saved-searches`
  - `PATCH /api/me/alerts`
- Sanity check: with the server running, `npm run sanity --prefix backend` pings `/api/health`.

## BuildRootz data wiring

- KeepUP publishes into the `BuildRootz` MongoDB database (casing matters). The Mongo user should have read/write on that DB.
- Set `BUILDROOTZ_MONGODB_URI` (and `BUILDROOTZ_DB_NAME=BuildRootz` if the server is case-sensitive) wherever the KeepUP/Next server runs; restart after setting.
- KeepUp internal publish endpoint: `POST /internal/publish/keepup/bundle`.
- `BRZ_INTERNAL_API_KEY` is required and must be sent as `Authorization: Bearer <token>`.
- Canonical community key is `publicCommunityId` (`String(PublicCommunity._id)`); legacy `communityId` is KeepUp/external mapping only.
- Builder and community profile pages are snapshot-first and read from KeepUP public endpoint:
  - `GET {KEEPUP_PUBLIC_BASE_URL}/public/brz/builders/:builderSlug`
- Mongo public collections (`PublicHome` / `PublicCommunity`) are legacy fallback only when `BRZ_FALLBACK_TO_MONGO_PUBLIC=1`.
- Example URI: `mongodb://user:pass@host:27017/BuildRootz`.

## KeepUP Snapshot Config

- `KEEPUP_PUBLIC_BASE_URL` (default `https://app.keepupcrm.com`)
- `KEEPUP_PUBLIC_TIMEOUT_MS` (default `4000`)
- `KEEPUP_PUBLIC_CACHE_TTL_SECONDS` (default `300`)
- `BRZ_FALLBACK_TO_MONGO_PUBLIC` (default `0`)
- `ENABLE_KEEPUP_SNAPSHOT_DEBUG` (optional, set `1` to enable debug endpoint)
  - `GET /api/debug/keepup-snapshot/:builderSlug`

## Snapshot Smoke Test

1. Ensure a builder has a published KeepUP BRZ snapshot.
2. Start services from repo root:
   - `npm start`
3. Open `http://localhost:3002/builder/<builderSlug>` and switch to `Communities`.
4. Confirm fields from snapshot render (`totalLots`, schools, HOA/contact, PID/MUD, model addresses, community-scoped plan pricing).
5. Re-publish in KeepUP, wait cache TTL (or restart), reload and confirm values update.
6. Verify no-snapshot behavior:
   - builder page returns 404 (or legacy fallback only if `BRZ_FALLBACK_TO_MONGO_PUBLIC=1`).
