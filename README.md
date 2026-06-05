# SongScope

**Crowdsourced emotional maps for music.**

SongScope lets listeners rate not just a song overall, but specific moments within it — marking exactly where a track hits hardest. Ratings from all users are aggregated into a smooth sentiment curve, forming an "emotional timeline" that shows collective listener response across every second of the song.

---

## What It Does

- **Search any song** via Spotify
- **Rate the whole track** with a decimal slider (0–10)
- **Rate specific intervals** with millisecond-precision timestamps (e.g. `1:42.5 – 2:05`)
- **Explore the emotional timeline** — a crowd-sourced sentiment graph with zoom, pan, and hover tooltips
- **View contributor stats** — how many listeners have mapped each song and each moment
- **Profile pages** — see your own song and interval rating history

---

## How the Aggregation Works

Raw interval ratings are stored with millisecond precision, then precomputed into 50ms buckets in an `AggregatedMetric` table. At query time, a Gaussian smoothing pass is applied per contiguous rated segment, with null gap markers inserted between unrated regions so the chart never falsely connects separate parts of a song. The result is a responsive, accurate sentiment curve that updates immediately after each new rating.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16, React, TypeScript, Tailwind CSS, Recharts, Zustand |
| Backend | Node.js, Express, TypeScript, Prisma ORM |
| Database | PostgreSQL |
| Auth | Stateless JWT (7-day), bcrypt |
| Music Data | Spotify Web API (Client Credentials) |

---

## Running Locally

### Prerequisites
- Node.js 20+
- Docker (for PostgreSQL)
- A [Spotify Developer](https://developer.spotify.com/dashboard) app (Client ID + Secret)

### 1. Clone and install

```bash
git clone https://github.com/WillNHansen/song-scope.git
cd song-scope
npm run install:all
```

### 2. Configure environment

```bash
cd backend && cp .env.example .env
cd ../frontend && cp .env.example .env.local
```

Edit `backend/.env`:
```
DATABASE_URL="postgresql://postgres:password@localhost:5432/songscope"
JWT_SECRET="any-long-random-string"
SPOTIFY_CLIENT_ID="your_spotify_client_id"
SPOTIFY_CLIENT_SECRET="your_spotify_client_secret"
```

### 3. Start the database and run

```bash
# From the repo root:
npm run db:up        # starts PostgreSQL via Docker
npm run db:setup     # runs Prisma migrations

npm run dev:backend  # API on http://localhost:4000
npm run dev:frontend # App on http://localhost:3000
```

---

## Deployment

The production app is deployed on **Railway** (backend + PostgreSQL) and **Vercel** (frontend).

### Backend (Railway)
1. Create a new Railway project, connect the GitHub repo
2. Add a PostgreSQL plugin — Railway auto-sets `DATABASE_URL`
3. Set environment variables:
   ```
   JWT_SECRET=<long random string>
   SPOTIFY_CLIENT_ID=<from Spotify dashboard>
   SPOTIFY_CLIENT_SECRET=<from Spotify dashboard>
   NODE_ENV=production
   FRONTEND_URL=https://your-vercel-url.vercel.app
   PORT=4000
   ```
4. Railway builds via `npm run build` (runs `prisma generate && tsc`) and starts via `npm start` (runs `prisma db push` then `node dist/index.js`)

### Frontend (Vercel)
1. Import the repo into Vercel, set root directory to `frontend/`
2. Add environment variable:
   ```
   NEXT_PUBLIC_API_URL=https://your-railway-url.up.railway.app
   ```
3. Deploy — Vercel auto-deploys on every push to `main`

After both are live, update `FRONTEND_URL` in Railway to the final Vercel URL so CORS is correctly scoped.

---

## Project Structure

```
song-scope/
├── backend/
│   ├── src/
│   │   ├── routes/       REST endpoints (songs, ratings, auth)
│   │   ├── services/     Spotify client, aggregation engine, email
│   │   └── middleware/   JWT auth, error handling
│   └── prisma/           Database schema and migrations
│
└── frontend/
    └── src/
        ├── app/          Pages: home, song detail, auth, profile
        ├── components/   EmotionalTimeline, IntervalRater, SongRatingWidget, ...
        └── lib/          API client, auth store (Zustand)
```

---

## AI Usage Disclosure

This project was built with substantial assistance from **Claude (Anthropic)** via Claude Code. Claude generated the majority of the code across the full stack — including the aggregation pipeline, chart component, auth system, and UI — based on direction, requirements, and iterative feedback from the developer. All architectural decisions, product design choices, debugging sessions, and feature prioritisation were driven by the developer. The developer reviewed, tested, and guided every part of the implementation.

This is disclosed in the spirit of academic honesty. The work reflects genuine effort in problem framing, product thinking, and technical decision-making, with AI used as an accelerant rather than a replacement for understanding.
