import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { searchTracks, getTrack } from '../services/spotify';
import { getSmoothedTimeline } from '../services/aggregation';
import { optionalAuth, AuthRequest } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

// Search Spotify and return results (not stored yet)
router.get('/search', async (req: Request, res: Response): Promise<void> => {
  const query = z.string().min(1).max(200).safeParse(req.query.q);
  if (!query.success) {
    res.status(400).json({ error: 'Missing or invalid query' });
    return;
  }
  try {
    const results = await searchTracks(query.data, 10);
    res.json(results);
  } catch (err: unknown) {
    const status = (err as { response?: { status?: number } })?.response?.status ?? 500;
    const message = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? 'Spotify search failed';
    res.status(status).json({ error: message });
  }
});

// Import a song from Spotify by its ID (upsert into DB)
router.post('/import/:spotifyId', async (req: Request, res: Response): Promise<void> => {
  const { spotifyId } = req.params;

  let song = await prisma.song.findUnique({ where: { spotifyId } });
  if (!song) {
    const metadata = await getTrack(spotifyId);
    song = await prisma.song.create({ data: metadata });
  }

  res.json(song);
});

// Get song detail with stats and timeline
router.get('/:id', optionalAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  const song = await prisma.song.findUnique({
    where: { id: req.params.id },
    include: {
      _count: {
        select: { songRatings: true, intervalRatings: true },
      },
    },
  });
  if (!song) {
    res.status(404).json({ error: 'Song not found' });
    return;
  }

  const [avgRatingResult, userRating, userIntervals, timeline, contributorCount] = await Promise.all([
    prisma.songRating.aggregate({
      where: { songId: song.id },
      _avg: { rating: true },
      _count: true,
    }),
    req.userId
      ? prisma.songRating.findUnique({
          where: { userId_songId: { userId: req.userId, songId: song.id } },
          select: { rating: true },
        })
      : null,
    req.userId
      ? prisma.intervalRating.findMany({
          where: { userId: req.userId, songId: song.id },
          orderBy: { startMs: 'asc' },
        })
      : [],
    getSmoothedTimeline(song.id),
    prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(DISTINCT "userId") as count FROM (
        SELECT "userId" FROM "SongRating" WHERE "songId" = ${song.id}
        UNION
        SELECT "userId" FROM "IntervalRating" WHERE "songId" = ${song.id}
      ) combined
    `.then(([r]) => Number(r.count)),
  ]);

  res.json({
    song,
    stats: {
      avgRating: avgRatingResult._avg.rating,
      ratingCount: avgRatingResult._count,
      intervalCount: song._count.intervalRatings,
      contributorCount,
    },
    timeline,
    userRating: userRating?.rating ?? null,
    userIntervals,
  });
});

// List recently imported songs
router.get('/', async (_req: Request, res: Response): Promise<void> => {
  // Order by most recent rating activity (song rating or interval rating)
  const recentlyActive = await prisma.$queryRaw<{ songId: string; lastActivity: Date }[]>`
    SELECT "songId", MAX("updatedAt") as "lastActivity" FROM (
      SELECT "songId", "updatedAt" FROM "SongRating"
      UNION ALL
      SELECT "songId", "updatedAt" FROM "IntervalRating"
    ) combined
    GROUP BY "songId"
    ORDER BY "lastActivity" DESC
    LIMIT 50
  `;

  const orderedIds = recentlyActive.map((r) => r.songId);

  const songs = await prisma.song.findMany({
    where: { id: { in: orderedIds } },
    include: {
      _count: { select: { songRatings: true } },
      songRatings: { select: { rating: true } },
    },
  });

  // Re-apply the activity order (findMany with IN doesn't preserve order)
  const songMap = new Map(songs.map((s) => [s.id, s]));
  const orderedSongs = orderedIds.map((id) => songMap.get(id)!).filter(Boolean);

  // Bulk contributor count across all returned songs in one query
  const songIds = orderedSongs.map((s) => s.id);
  const contributorRows = songIds.length > 0
    ? await prisma.$queryRaw<{ songId: string; count: bigint }[]>`
        SELECT "songId", COUNT(DISTINCT "userId") as count FROM (
          SELECT "songId", "userId" FROM "SongRating" WHERE "songId" = ANY(${songIds}::text[])
          UNION
          SELECT "songId", "userId" FROM "IntervalRating" WHERE "songId" = ANY(${songIds}::text[])
        ) combined
        GROUP BY "songId"
      `
    : [];

  const contributorMap = new Map(contributorRows.map((r) => [r.songId, Number(r.count)]));

  const enriched = orderedSongs.map((s) => ({
    ...s,
    avgRating:
      s.songRatings.length > 0
        ? s.songRatings.reduce((acc, r) => acc + r.rating, 0) / s.songRatings.length
        : null,
    contributorCount: contributorMap.get(s.id) ?? 0,
    songRatings: undefined,
    _count: undefined,
  }));

  res.json(enriched);
});

export default router;
