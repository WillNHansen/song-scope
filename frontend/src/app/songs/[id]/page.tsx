'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Image from 'next/image';
import { Clock, Users, BarChart2, Layers, Music } from 'lucide-react';
import api, { msToTimestamp, formatRating } from '@/lib/api';
import { useAuthStore } from '@/lib/auth';
import EmotionalTimeline from '@/components/EmotionalTimeline';
import SongRatingWidget from '@/components/SongRatingWidget';
import IntervalRater from '@/components/IntervalRater';
import type { SongDetail } from '@/types';
import Link from 'next/link';

export default function SongPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuthStore();
  const [detail, setDetail] = useState<SongDetail | null>(null);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    const { data } = await api.get<SongDetail>(`/api/songs/${id}`);
    setDetail(data);
    setLoading(false);
  }, [id]);

  useEffect(() => { fetch(); }, [fetch]);

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-20 text-center">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-20 text-center text-white/50">
        Song not found.
      </div>
    );
  }

  const { song, stats, timeline, userRating, userIntervals } = detail;

  const peakPoint = timeline.length > 0
    ? timeline.reduce((max, p) => (p.value > max.value ? p : max), timeline[0])
    : null;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      {/* Song header */}
      <div className="mb-8 flex gap-6">
        <div className="relative h-36 w-36 flex-shrink-0 overflow-hidden rounded-2xl bg-surface-2 shadow-2xl">
          {song.albumArtUrl ? (
            <Image
              src={song.albumArtUrl}
              alt={song.album}
              fill
              className="object-cover"
              sizes="144px"
              priority
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <Music size={32} className="text-white/20" />
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-accent">
            {song.album} · {song.releaseDate?.slice(0, 4)}
          </p>
          <h1 className="mb-1 text-2xl font-bold text-white sm:text-3xl">{song.title}</h1>
          <p className="mb-4 text-lg text-white/60">{song.artist}</p>

          <div className="flex flex-wrap items-center gap-4 text-sm text-white/40">
            <span className="flex items-center gap-1.5">
              <Clock size={14} />
              {msToTimestamp(song.durationMs)}
            </span>
            <span className="flex items-center gap-1.5">
              <Users size={14} />
              {stats.contributorCount} contributor{stats.contributorCount !== 1 ? 's' : ''}
            </span>
            <span className="flex items-center gap-1.5">
              <BarChart2 size={14} />
              {stats.ratingCount} rating{stats.ratingCount !== 1 ? 's' : ''}
            </span>
            <span className="flex items-center gap-1.5">
              <Layers size={14} />
              {stats.intervalCount} interval{stats.intervalCount !== 1 ? 's' : ''}
            </span>
          </div>
        </div>

        {/* Overall rating badge */}
        <div className="flex-shrink-0 text-right">
          <div className="inline-flex flex-col items-center rounded-2xl border border-accent/20 bg-accent/10 px-5 py-3">
            <span className="text-3xl font-bold text-accent">
              {formatRating(stats.avgRating)}
            </span>
            <span className="text-xs text-white/40">avg rating</span>
          </div>
        </div>
      </div>

      {/* Emotional Timeline — hero section */}
      <div className="mb-8 rounded-2xl border border-white/5 bg-surface-1 p-6">
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h2 className="text-base font-bold text-white">Emotional Timeline</h2>
            <p className="mt-0.5 text-sm text-white/40">
              Crowd-sourced listener sentiment across the track
            </p>
          </div>
          {peakPoint && (
            <div className="text-right">
              <p className="text-xs text-white/30 uppercase tracking-wider">Peak moment</p>
              <p className="font-mono text-sm font-semibold text-peak">
                {msToTimestamp(peakPoint.ms)}
              </p>
              <p className="text-xs text-accent">{peakPoint.value.toFixed(1)}/10</p>
            </div>
          )}
        </div>

        <EmotionalTimeline
          data={timeline}
          durationMs={song.durationMs}
          peakMs={peakPoint?.ms}
        />

        {timeline.length === 0 && (
          <p className="mt-2 text-xs text-white/20">
            Add interval ratings below to generate the emotional map.
          </p>
        )}
      </div>

      {/* Ratings section */}
      {user ? (
        <div className="space-y-8 rounded-2xl border border-white/5 bg-surface-1 p-6">
          <SongRatingWidget
            songId={song.id}
            currentRating={userRating}
            onUpdate={fetch}
          />

          <div className="border-t border-white/5 pt-6">
            <IntervalRater
              song={song}
              intervals={userIntervals}
              onUpdate={fetch}
            />
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-white/5 bg-surface-1 p-8 text-center">
          <p className="mb-4 text-white/50">
            Sign in to rate this song and contribute to the emotional map.
          </p>
          <div className="flex justify-center gap-3">
            <Link
              href="/auth/login"
              className="rounded-lg border border-white/10 px-4 py-2 text-sm text-white/70 transition hover:bg-surface-2"
            >
              Log in
            </Link>
            <Link
              href="/auth/register"
              className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent/80"
            >
              Sign up free
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
