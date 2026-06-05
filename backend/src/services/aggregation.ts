import { PrismaClient } from '@prisma/client';
import { config } from '../config';

const prisma = new PrismaClient();

export interface BucketPoint {
  bucketMs: number;
  avgRating: number;
  ratingCount: number;
}

export interface SmoothedPoint {
  ms: number;
  value: number | null; // null = gap between rated regions
  ratingCount: number;
}

// Rebuild precomputed aggregation buckets for a song.
// A user's overall song rating acts as a base interval covering the full song,
// overridden bucket-by-bucket by any specific interval ratings they've submitted.
export async function recomputeAggregation(
  songId: string,
  bucketSizeMs = config.aggregation.defaultBucketSizeMs
): Promise<void> {
  const [song, songRatings, intervalRatings] = await Promise.all([
    prisma.song.findUnique({ where: { id: songId }, select: { durationMs: true } }),
    prisma.songRating.findMany({ where: { songId }, select: { userId: true, rating: true } }),
    prisma.intervalRating.findMany({
      where: { songId },
      select: { userId: true, startMs: true, endMs: true, rating: true },
    }),
  ]);

  if (!song || (songRatings.length === 0 && intervalRatings.length === 0)) {
    await prisma.aggregatedMetric.deleteMany({ where: { songId, bucketSizeMs } });
    return;
  }

  const durationMs = song.durationMs;

  // Build per-user bucket contributions:
  // 1. Song rating → base for all buckets across the full song
  // 2. Interval ratings → override specific buckets
  const userBuckets = new Map<string, Map<number, number>>();

  for (const sr of songRatings) {
    const userMap = new Map<number, number>();
    for (let bucket = 0; bucket < durationMs; bucket += bucketSizeMs) {
      userMap.set(bucket, sr.rating);
    }
    userBuckets.set(sr.userId, userMap);
  }

  for (const ir of intervalRatings) {
    if (!userBuckets.has(ir.userId)) userBuckets.set(ir.userId, new Map());
    const userMap = userBuckets.get(ir.userId)!;
    const firstBucket = Math.floor(ir.startMs / bucketSizeMs) * bucketSizeMs;
    const lastBucket = Math.floor((ir.endMs - 1) / bucketSizeMs) * bucketSizeMs;
    for (let bucket = firstBucket; bucket <= lastBucket; bucket += bucketSizeMs) {
      userMap.set(bucket, ir.rating);
    }
  }

  // Aggregate across all users per bucket
  const bucketMap = new Map<number, { sum: number; count: number }>();
  for (const userMap of userBuckets.values()) {
    for (const [bucket, rating] of userMap) {
      const existing = bucketMap.get(bucket) ?? { sum: 0, count: 0 };
      existing.sum += rating;
      existing.count += 1;
      bucketMap.set(bucket, existing);
    }
  }

  // Delete all existing buckets first so removed ratings don't leave stale data
  await prisma.aggregatedMetric.deleteMany({ where: { songId, bucketSizeMs } });

  if (bucketMap.size === 0) return;

  await prisma.$transaction(
    Array.from(bucketMap.entries()).map(([bucketMs, { sum, count }]) =>
      prisma.aggregatedMetric.create({
        data: { songId, bucketMs, bucketSizeMs, avgRating: sum / count, ratingCount: count },
      })
    )
  );
}

// Load precomputed buckets, smooth within contiguous segments only,
// and insert null gap markers between unrated regions.
export async function getSmoothedTimeline(
  songId: string,
  bucketSizeMs = config.aggregation.defaultBucketSizeMs
): Promise<SmoothedPoint[]> {
  const metrics = await prisma.aggregatedMetric.findMany({
    where: { songId, bucketSizeMs },
    orderBy: { bucketMs: 'asc' },
  });

  if (metrics.length === 0) return [];

  const raw: BucketPoint[] = metrics.map((m) => ({
    bucketMs: m.bucketMs,
    avgRating: m.avgRating,
    ratingCount: m.ratingCount,
  }));

  // Split into contiguous segments — a gap is any jump larger than one bucket width.
  const segments: BucketPoint[][] = [];
  let current: BucketPoint[] = [raw[0]];

  for (let i = 1; i < raw.length; i++) {
    if (raw[i].bucketMs - raw[i - 1].bucketMs <= bucketSizeMs) {
      current.push(raw[i]);
    } else {
      segments.push(current);
      current = [raw[i]];
    }
  }
  segments.push(current);

  // Smooth each segment independently, then join with a null gap marker between them.
  const result: SmoothedPoint[] = [];

  for (let s = 0; s < segments.length; s++) {
    const smoothed = gaussianSmooth(segments[s], 3);
    result.push(...smoothed);

    if (s < segments.length - 1) {
      // Place a null point midway through the gap so recharts renders a visible break.
      const gapMs = Math.round(
        (segments[s][segments[s].length - 1].bucketMs + segments[s + 1][0].bucketMs) / 2
      );
      result.push({ ms: gapMs, value: null, ratingCount: 0 });
    }
  }

  return result;
}

// Gaussian kernel smoothing — only looks within the supplied array (one segment).
function gaussianSmooth(points: BucketPoint[], windowSize: number): SmoothedPoint[] {
  const sigma = windowSize / 2;
  const kernel = Array.from({ length: windowSize * 2 + 1 }, (_, i) => {
    const x = i - windowSize;
    return Math.exp(-(x * x) / (2 * sigma * sigma));
  });
  const kernelSum = kernel.reduce((a, b) => a + b, 0);
  const normalized = kernel.map((k) => k / kernelSum);

  return points.map((_, idx) => {
    let value = 0;
    let totalWeight = 0;

    for (let k = 0; k < normalized.length; k++) {
      const srcIdx = idx + k - windowSize;
      if (srcIdx < 0 || srcIdx >= points.length) continue;
      value += points[srcIdx].avgRating * normalized[k];
      totalWeight += normalized[k];
    }

    return {
      ms: points[idx].bucketMs,
      value: totalWeight > 0 ? value / totalWeight : 0,
      ratingCount: points[idx].ratingCount,
    };
  });
}
