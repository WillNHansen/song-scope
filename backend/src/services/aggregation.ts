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

// Rebuild precomputed aggregation buckets for a song from raw interval ratings.
export async function recomputeAggregation(
  songId: string,
  bucketSizeMs = config.aggregation.defaultBucketSizeMs
): Promise<void> {
  const ratings = await prisma.intervalRating.findMany({
    where: { songId },
    select: { startMs: true, endMs: true, rating: true },
  });

  if (ratings.length === 0) {
    await prisma.aggregatedMetric.deleteMany({ where: { songId, bucketSizeMs } });
    return;
  }

  const maxMs = Math.max(...ratings.map((r) => r.endMs));

  const bucketMap = new Map<number, { sum: number; count: number }>();

  for (const rating of ratings) {
    const firstBucket = Math.floor(rating.startMs / bucketSizeMs) * bucketSizeMs;
    const lastBucket = Math.floor((rating.endMs - 1) / bucketSizeMs) * bucketSizeMs;

    for (let bucket = firstBucket; bucket <= lastBucket; bucket += bucketSizeMs) {
      const existing = bucketMap.get(bucket) ?? { sum: 0, count: 0 };
      existing.sum += rating.rating;
      existing.count += 1;
      bucketMap.set(bucket, existing);
    }
  }

  // Delete all existing buckets first so removed intervals don't leave stale data
  await prisma.aggregatedMetric.deleteMany({ where: { songId, bucketSizeMs } });

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
