'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Search, Music, Loader2 } from 'lucide-react';
import api from '@/lib/api';
import type { SpotifyTrackResult } from '@/types';
import { msToTimestamp } from '@/lib/api';

export default function SearchBar() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SpotifyTrackResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const router = useRouter();

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) {
      setResults([]);
      setOpen(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const { data } = await api.get<SpotifyTrackResult[]>('/api/songs/search', {
          params: { q: query },
        });
        setResults(data);
        setOpen(true);
      } finally {
        setLoading(false);
      }
    }, 350);
  }, [query]);

  async function selectTrack(track: SpotifyTrackResult) {
    setOpen(false);
    setQuery('');
    const { data } = await api.post<{ id: string }>(`/api/songs/import/${track.spotifyId}`);
    router.push(`/songs/${data.id}`);
  }

  return (
    <div className="relative w-full">
      <div className="relative flex items-center">
        {loading ? (
          <Loader2 size={18} className="absolute left-3 animate-spin text-white/30" />
        ) : (
          <Search size={18} className="absolute left-3 text-white/30" />
        )}
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder="Search for any song..."
          className="w-full rounded-xl border border-white/10 bg-surface-1 py-3 pl-10 pr-4 text-white placeholder:text-white/30 focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/30"
        />
      </div>

      {open && results.length > 0 && (
        <div className="absolute z-50 mt-2 w-full overflow-hidden rounded-xl border border-white/10 bg-surface-2 shadow-2xl">
          {results.slice(0, 8).map((track) => (
            <button
              key={track.spotifyId}
              onClick={() => selectTrack(track)}
              className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-surface-3"
            >
              <div className="relative h-10 w-10 flex-shrink-0 overflow-hidden rounded bg-surface-3">
                {track.albumArtUrl ? (
                  <Image src={track.albumArtUrl} alt={track.album} fill className="object-cover" sizes="40px" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <Music size={16} className="text-white/20" />
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-white">{track.title}</p>
                <p className="truncate text-xs text-white/50">{track.artist} · {track.album}</p>
              </div>
              <span className="text-xs font-mono text-white/30">{msToTimestamp(track.durationMs)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
