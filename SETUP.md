# SongScope Setup Guide

## Prerequisites

- Node.js 20+
- Docker (for PostgreSQL)
- Spotify Developer account

## 1. Spotify API Credentials

1. Go to https://developer.spotify.com/dashboard
2. Create a new app (Redirect URI: `http://localhost:3000`)
3. Copy your **Client ID** and **Client Secret**

## 2. Backend Environment

```bash
cd backend
cp .env.example .env
```

Edit `.env` with your values:
```
DATABASE_URL="postgresql://postgres:password@localhost:5432/songscope"
JWT_SECRET="generate-a-long-random-secret-here"
SPOTIFY_CLIENT_ID="your_client_id"
SPOTIFY_CLIENT_SECRET="your_client_secret"
```

## 3. Frontend Environment

```bash
cd frontend
cp .env.example .env.local
```

## 4. Install & Start

```bash
# From the root songscope/ directory:

# Install all dependencies
npm run install:all

# Start PostgreSQL
npm run db:up

# Wait ~5 seconds for postgres to be ready, then:
npm run db:setup

# In one terminal:
npm run dev:backend

# In another terminal:
npm run dev:frontend
```

The app will be available at http://localhost:3000

Backend API at http://localhost:4000

## Architecture Overview

```
songscope/
├── backend/               Express + Prisma API
│   ├── src/
│   │   ├── routes/        REST endpoints
│   │   ├── services/      Spotify API + aggregation engine
│   │   └── middleware/    Auth + error handling
│   └── prisma/            Database schema + migrations
│
└── frontend/              Next.js 14 app
    └── src/
        ├── app/           Pages (home, song detail, auth, profile)
        ├── components/    UI components + EmotionalTimeline
        └── lib/           API client + auth store
```

## Key Design Decisions

### Aggregation Pipeline
- Raw interval ratings stored with millisecond precision
- Precomputed into 500ms buckets in `AggregatedMetric` table
- Gaussian smoothing applied at query time for visualization
- Bucket size is configurable (default 500ms)
- Buckets rebuild asynchronously after each new rating

### Emotional Timeline
- Uses Recharts AreaChart with purple→pink gradient fill
- Smooth `monotone` curve interpolation
- Hover tooltips show timestamp + avg rating + count
- Peak moment highlighted with reference line

### Scalability
- `AggregatedMetric` table acts as a materialized view
- All hot paths read from precomputed buckets, not raw data
- Indexes on `(songId, bucketMs, bucketSizeMs)` for O(1) lookups
- JWT auth is stateless — no session storage
- Rate limiting on all API endpoints
