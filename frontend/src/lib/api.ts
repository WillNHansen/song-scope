import axios from 'axios';

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000',
});

api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default api;

export function msToTimestamp(ms: number): string {
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const millis = ms % 1000;
  const secStr = String(seconds).padStart(2, '0');
  return millis === 0
    ? `${minutes}:${secStr}`
    : `${minutes}:${secStr}.${String(millis).padStart(3, '0').replace(/0+$/, '')}`;
}

export function formatRating(r: number | null): string {
  if (r === null) return '—';
  return r.toFixed(1);
}

// Compute a personal smoothed timeline from a user's own interval ratings (client-side)
const BUCKET_MS = 50;
const WINDOW = 3;

export function computePersonalTimeline(
  intervals: { startMs: number; endMs: number; rating: number }[],
  durationMs: number
): { ms: number; value: number | null; ratingCount: number }[] {
  if (intervals.length === 0) return [];

  const bucketMap = new Map<number, number>();
  for (const iv of intervals) {
    const first = Math.floor(iv.startMs / BUCKET_MS) * BUCKET_MS;
    const last = Math.floor((iv.endMs - 1) / BUCKET_MS) * BUCKET_MS;
    for (let b = first; b <= last; b += BUCKET_MS) bucketMap.set(b, iv.rating);
  }

  if (bucketMap.size === 0) return [];

  const sorted = Array.from(bucketMap.entries()).sort(([a], [b]) => a - b);

  // Split into contiguous segments
  const segments: { ms: number; rating: number }[][] = [];
  let current = [{ ms: sorted[0][0], rating: sorted[0][1] }];
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i][0] - sorted[i - 1][0] <= BUCKET_MS) {
      current.push({ ms: sorted[i][0], rating: sorted[i][1] });
    } else {
      segments.push(current);
      current = [{ ms: sorted[i][0], rating: sorted[i][1] }];
    }
  }
  segments.push(current);

  // Gaussian smooth each segment
  const sigma = WINDOW / 2;
  const kernel = Array.from({ length: WINDOW * 2 + 1 }, (_, i) => {
    const x = i - WINDOW;
    return Math.exp(-(x * x) / (2 * sigma * sigma));
  });
  const kernelSum = kernel.reduce((a, b) => a + b, 0);
  const norm = kernel.map((k) => k / kernelSum);

  const result: { ms: number; value: number | null; ratingCount: number }[] = [];
  for (let s = 0; s < segments.length; s++) {
    const seg = segments[s];
    for (let i = 0; i < seg.length; i++) {
      let val = 0, weight = 0;
      for (let k = 0; k < norm.length; k++) {
        const idx = i + k - WINDOW;
        if (idx < 0 || idx >= seg.length) continue;
        val += seg[idx].rating * norm[k];
        weight += norm[k];
      }
      result.push({ ms: seg[i].ms, value: weight > 0 ? val / weight : 0, ratingCount: 1 });
    }
    if (s < segments.length - 1) {
      const gapMs = Math.round((seg[seg.length - 1].ms + segments[s + 1][0].ms) / 2);
      result.push({ ms: gapMs, value: null, ratingCount: 0 });
    }
  }
  return result;
}
