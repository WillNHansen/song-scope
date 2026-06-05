'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { Music, Star, BarChart2, Calendar } from 'lucide-react';
import api, { msToTimestamp } from '@/lib/api';

interface SongRating {
  rating: number;
  updatedAt: string;
  song: { id: string; title: string; artist: string; albumArtUrl: string | null };
}

interface IntervalRating {
  rating: number;
  startMs: number;
  endMs: number;
  updatedAt: string;
  song: { id: string; title: string; artist: string; albumArtUrl: string | null };
}

interface ProfileData {
  id: string;
  username: string;
  bio: string | null;
  createdAt: string;
  songRatings: SongRating[];
  intervalRatings: IntervalRating[];
  _count: { songRatings: number; intervalRatings: number };
  songsContributed: number;
}

function AlbumArt({ song }: { song: { title: string; albumArtUrl: string | null } }) {
  return (
    <div className="relative h-11 w-11 flex-shrink-0 overflow-hidden rounded-lg bg-surface-3">
      {song.albumArtUrl ? (
        <Image src={song.albumArtUrl} alt={song.title} fill className="object-cover" sizes="44px" />
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <Music size={16} className="text-white/20" />
        </div>
      )}
    </div>
  );
}

export default function ProfilePage() {
  const { username } = useParams<{ username: string }>();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'songs' | 'intervals'>('songs');

  useEffect(() => {
    api
      .get<ProfileData>(`/api/auth/profile/${username}`)
      .then(({ data }) => setProfile(data))
      .finally(() => setLoading(false));
  }, [username]);

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-20 text-center">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-20 text-center text-white/50">
        User not found.
      </div>
    );
  }

  // Group interval ratings by song for a cleaner display
  const intervalsBySong = profile.intervalRatings.reduce<
    Record<string, { song: IntervalRating['song']; intervals: IntervalRating[] }>
  >((acc, ir) => {
    if (!acc[ir.song.id]) acc[ir.song.id] = { song: ir.song, intervals: [] };
    acc[ir.song.id].intervals.push(ir);
    return acc;
  }, {});

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      {/* Profile header */}
      <div className="mb-10 flex items-center gap-6">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-accent/40 to-peak/40 text-3xl font-bold text-white">
          {profile.username[0].toUpperCase()}
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">@{profile.username}</h1>
          {profile.bio && <p className="mt-1 text-white/50">{profile.bio}</p>}
          <p className="mt-2 flex items-center gap-1.5 text-sm text-white/30">
            <Calendar size={13} />
            Joined {new Date(profile.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long' })}
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="mb-10 grid grid-cols-2 gap-4">
        <div className="rounded-xl border border-white/5 bg-surface-1 p-5">
          <div className="flex items-center gap-2 text-white/40">
            <Star size={16} />
            <span className="text-sm">Songs Contributed To</span>
          </div>
          <p className="mt-2 text-3xl font-bold text-white">{profile.songsContributed}</p>
        </div>
        <div className="rounded-xl border border-white/5 bg-surface-1 p-5">
          <div className="flex items-center gap-2 text-white/40">
            <BarChart2 size={16} />
            <span className="text-sm">Interval Ratings</span>
          </div>
          <p className="mt-2 text-3xl font-bold text-white">{profile._count.intervalRatings}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-6 flex gap-1 rounded-xl border border-white/5 bg-surface-1 p-1">
        {(['songs', 'intervals'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 rounded-lg py-2 text-sm font-medium transition ${
              tab === t
                ? 'bg-accent/20 text-accent'
                : 'text-white/40 hover:text-white/70'
            }`}
          >
            {t === 'songs' ? `Song Ratings (${profile._count.songRatings})` : `Interval Ratings (${profile._count.intervalRatings})`}
          </button>
        ))}
      </div>

      {/* Song ratings tab */}
      {tab === 'songs' && (
        profile.songRatings.length === 0 ? (
          <p className="py-12 text-center text-sm text-white/30">No song ratings yet.</p>
        ) : (
          <div className="space-y-2">
            {profile.songRatings.map((sr, i) => (
              <Link
                key={i}
                href={`/songs/${sr.song.id}`}
                className="flex items-center gap-4 rounded-xl border border-white/5 bg-surface-1 p-4 transition hover:border-accent/30"
              >
                <AlbumArt song={sr.song} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-white">{sr.song.title}</p>
                  <p className="truncate text-sm text-white/40">{sr.song.artist}</p>
                </div>
                <span className="text-lg font-bold text-accent">{sr.rating.toFixed(1)}</span>
              </Link>
            ))}
          </div>
        )
      )}

      {/* Interval ratings tab */}
      {tab === 'intervals' && (
        Object.keys(intervalsBySong).length === 0 ? (
          <p className="py-12 text-center text-sm text-white/30">No interval ratings yet.</p>
        ) : (
          <div className="space-y-4">
            {Object.values(intervalsBySong).map(({ song, intervals }) => (
              <Link
                key={song.id}
                href={`/songs/${song.id}`}
                className="block rounded-xl border border-white/5 bg-surface-1 p-4 transition hover:border-accent/30"
              >
                {/* Song header */}
                <div className="mb-3 flex items-center gap-4">
                  <AlbumArt song={song} />
                  <div className="min-w-0">
                    <p className="truncate font-medium text-white">{song.title}</p>
                    <p className="truncate text-sm text-white/40">{song.artist}</p>
                  </div>
                  <span className="ml-auto text-xs text-white/30">{intervals.length} interval{intervals.length !== 1 ? 's' : ''}</span>
                </div>
                {/* Intervals list */}
                <div className="space-y-1.5">
                  {intervals
                    .slice()
                    .sort((a, b) => a.startMs - b.startMs)
                    .map((ir, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-3 rounded-lg bg-surface-2 px-3 py-2 text-sm"
                      >
                        <span className="font-mono text-white/50">
                          {msToTimestamp(ir.startMs)} – {msToTimestamp(ir.endMs)}
                        </span>
                        <div className="flex-1 rounded-full bg-white/5 h-1.5 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-accent/60"
                            style={{ width: `${(ir.rating / 10) * 100}%` }}
                          />
                        </div>
                        <span className="font-bold text-accent">{ir.rating.toFixed(1)}</span>
                      </div>
                    ))}
                </div>
              </Link>
            ))}
          </div>
        )
      )}
    </div>
  );
}
