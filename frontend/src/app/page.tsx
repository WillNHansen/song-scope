'use client';

import { useEffect, useState } from 'react';
import { TrendingUp, Music2 } from 'lucide-react';
import SearchBar from '@/components/SearchBar';
import SongCard from '@/components/SongCard';
import api from '@/lib/api';

interface SongSummary {
  id: string;
  title: string;
  artist: string;
  album: string;
  albumArtUrl: string | null;
  durationMs: number;
  avgRating: number | null;
  contributorCount: number;
}

export default function HomePage() {
  const [songs, setSongs] = useState<SongSummary[]>([]);

  useEffect(() => {
    api.get<SongSummary[]>('/api/songs').then(({ data }) => setSongs(data));
  }, []);

  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      {/* Hero */}
      <div className="mb-12 text-center">
        <div className="mb-4 flex justify-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-4 py-1.5 text-sm text-accent">
            <Music2 size={14} />
            Crowdsourced emotional maps for music
          </div>
        </div>
        <h1 className="mb-3 text-4xl font-bold tracking-tight text-white sm:text-5xl">
          Where does the song{' '}
          <span className="bg-gradient-to-r from-accent to-peak bg-clip-text text-transparent">
            hit hardest?
          </span>
        </h1>
        <p className="mx-auto max-w-xl text-lg text-white/50">
          Search any song and explore listener sentiment across every moment. Rate intervals,
          discover peaks, and map the emotional DNA of music.
        </p>
      </div>

      {/* Search */}
      <div className="mb-12">
        <SearchBar />
      </div>

      {/* Recent songs */}
      {songs.length > 0 && (
        <div>
          <div className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-white/40">
            <TrendingUp size={14} />
            Recently Mapped
          </div>
          <div className="space-y-2">
            {songs.map((song) => (
              <SongCard key={song.id} {...song} />
            ))}
          </div>
        </div>
      )}

      {songs.length === 0 && (
        <div className="text-center">
          <p className="text-sm text-white/20">
            Search for a song above to get started. Be the first to map it.
          </p>
        </div>
      )}
    </div>
  );
}
