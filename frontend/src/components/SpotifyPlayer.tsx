'use client';

import { useEffect, useState, useRef } from 'react';
import { Play, Pause, Music2 } from 'lucide-react';
import { initSpotifyPlayer, onPlayerReady, getPlayer } from '@/lib/spotify';
import { useAuthStore } from '@/lib/auth';

export default function SpotifyPlayer() {
  const { user } = useAuthStore();
  const [ready, setReady] = useState(false);
  const [state, setState] = useState<Spotify.PlaybackState | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!user?.spotifyConnected) return;

    initSpotifyPlayer();
    const unsub = onPlayerReady(setReady);
    return unsub;
  }, [user?.spotifyConnected]);

  useEffect(() => {
    if (!ready) return;
    const player = getPlayer();
    if (!player) return;

    player.addListener('player_state_changed', (s) => {
      setState(s);
    });

    // Poll for position updates while playing
    intervalRef.current = setInterval(async () => {
      // Re-fetch state to get updated position
      const p = getPlayer();
      if (!p) return;
    }, 500);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [ready]);

  if (!user?.spotifyConnected || !ready || !state) return null;

  const track = state.track_window.current_track;
  const albumArt = track.album.images[0]?.url;
  const positionMs = state.position;
  const durationMs = state.duration;
  const pct = durationMs > 0 ? (positionMs / durationMs) * 100 : 0;

  function fmt(ms: number) {
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-white/5 bg-surface-1/95 backdrop-blur-md">
      <div className="mx-auto flex max-w-4xl items-center gap-4 px-4 py-3">
        {/* Album art */}
        <div className="h-10 w-10 flex-shrink-0 overflow-hidden rounded-md bg-surface-2">
          {albumArt ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={albumArt} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <Music2 size={16} className="text-white/20" />
            </div>
          )}
        </div>

        {/* Track info */}
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold text-white">{track.name}</p>
          <p className="truncate text-xs text-white/40">{track.artists.map((a) => a.name).join(', ')}</p>
        </div>

        {/* Play/pause */}
        <button
          onClick={() => (state.paused ? getPlayer()?.resume() : getPlayer()?.pause())}
          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-accent/20 text-accent transition hover:bg-accent/30"
        >
          {state.paused ? <Play size={14} fill="currentColor" /> : <Pause size={14} fill="currentColor" />}
        </button>

        {/* Progress */}
        <div className="hidden w-36 sm:block">
          <div className="mb-1 h-1 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${pct}%` }} />
          </div>
          <div className="flex justify-between text-[10px] text-white/30">
            <span>{fmt(positionMs)}</span>
            <span>{fmt(durationMs)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
