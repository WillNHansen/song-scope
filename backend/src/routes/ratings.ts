import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { recomputeAggregation } from '../services/aggregation';

const router = Router();
const prisma = new PrismaClient();

async function findOverlap(
  userId: string,
  songId: string,
  startMs: number,
  endMs: number,
  excludeId?: string
) {
  return prisma.intervalRating.findFirst({
    where: {
      userId,
      songId,
      id: excludeId ? { not: excludeId } : undefined,
      // Two intervals overlap when start < otherEnd AND end > otherStart.
      // Adjacent intervals (e.g. 0–15 and 15–30) are allowed; the earlier one owns the boundary.
      startMs: { lt: endMs },
      endMs: { gt: startMs + 1 },
    },
  });
}

const songRatingSchema = z.object({
  songId: z.string(),
  rating: z.number().min(0).max(10),
});

const intervalRatingSchema = z.object({
  songId: z.string(),
  startMs: z.number().int().min(0),
  endMs: z.number().int().min(1),
  rating: z.number().min(0).max(10),
}).refine((d) => d.endMs > d.startMs, { message: 'endMs must be after startMs' });

// Submit or update a whole-song rating
router.post('/song', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  const parsed = songRatingSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const { songId, rating } = parsed.data;

  const song = await prisma.song.findUnique({ where: { id: songId } });
  if (!song) {
    res.status(404).json({ error: 'Song not found' });
    return;
  }

  const result = await prisma.songRating.upsert({
    where: { userId_songId: { userId: req.userId!, songId } },
    create: { userId: req.userId!, songId, rating },
    update: { rating },
  });

  await recomputeAggregation(songId);
  res.json(result);
});

// Delete a whole-song rating
router.delete('/song/:songId', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  const { songId } = req.params;
  const deleted = await prisma.songRating.deleteMany({
    where: { userId: req.userId!, songId },
  });
  if (deleted.count === 0) {
    res.status(404).json({ error: 'Rating not found' });
    return;
  }
  await recomputeAggregation(songId);
  res.json({ success: true });
});

// Submit an interval rating
router.post('/interval', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  const parsed = intervalRatingSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const { songId, startMs, endMs, rating } = parsed.data;

  const song = await prisma.song.findUnique({ where: { id: songId } });
  if (!song) {
    res.status(404).json({ error: 'Song not found' });
    return;
  }
  if (endMs > song.durationMs) {
    res.status(400).json({ error: 'Interval exceeds song duration' });
    return;
  }

  const overlap = await findOverlap(req.userId!, songId, startMs, endMs);
  if (overlap) {
    res.status(409).json({
      error: `Overlaps with your existing rating at ${Math.floor(overlap.startMs / 60000)}:${String(Math.floor((overlap.startMs % 60000) / 1000)).padStart(2, '0')}–${Math.floor(overlap.endMs / 60000)}:${String(Math.floor((overlap.endMs % 60000) / 1000)).padStart(2, '0')}`,
    });
    return;
  }

  const result = await prisma.intervalRating.create({
    data: { userId: req.userId!, songId, startMs, endMs, rating },
  });

  await recomputeAggregation(songId);

  res.status(201).json(result);
});

// Update an interval rating
router.patch('/interval/:id', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  const schema = z.object({
    rating: z.number().min(0).max(10),
    startMs: z.number().int().min(0).optional(),
    endMs: z.number().int().min(1).optional(),
  }).refine((d) => !d.startMs || !d.endMs || d.endMs > d.startMs, {
    message: 'endMs must be after startMs',
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const existing = await prisma.intervalRating.findFirst({
    where: { id: req.params.id, userId: req.userId! },
  });
  if (!existing) {
    res.status(404).json({ error: 'Rating not found' });
    return;
  }

  const song = await prisma.song.findUnique({ where: { id: existing.songId } });
  const startMs = parsed.data.startMs ?? existing.startMs;
  const endMs = parsed.data.endMs ?? existing.endMs;

  if (song && endMs > song.durationMs) {
    res.status(400).json({ error: 'Interval exceeds song duration' });
    return;
  }

  const overlap = await findOverlap(req.userId!, existing.songId, startMs, endMs, existing.id);
  if (overlap) {
    res.status(409).json({
      error: `Overlaps with your existing rating at ${Math.floor(overlap.startMs / 60000)}:${String(Math.floor((overlap.startMs % 60000) / 1000)).padStart(2, '0')}–${Math.floor(overlap.endMs / 60000)}:${String(Math.floor((overlap.endMs % 60000) / 1000)).padStart(2, '0')}`,
    });
    return;
  }

  const updated = await prisma.intervalRating.update({
    where: { id: req.params.id },
    data: {
      rating: parsed.data.rating,
      ...(parsed.data.startMs !== undefined && { startMs: parsed.data.startMs }),
      ...(parsed.data.endMs !== undefined && { endMs: parsed.data.endMs }),
    },
  });

  await recomputeAggregation(existing.songId);
  res.json(updated);
});

// Delete an interval rating
router.delete('/interval/:id', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  const existing = await prisma.intervalRating.findFirst({
    where: { id: req.params.id, userId: req.userId! },
  });
  if (!existing) {
    res.status(404).json({ error: 'Rating not found' });
    return;
  }

  await prisma.intervalRating.delete({ where: { id: req.params.id } });
  await recomputeAggregation(existing.songId);
  res.json({ success: true });
});

export default router;
