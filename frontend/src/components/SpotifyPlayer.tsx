'use client';

import { useEffect, useState, useRef } from 'react';
import { Play, Pause, Music2 } from 'lucide-react';
import { initSpotifyPlayer, onPlayerReady, getPlayer } from '@/lib/spotify';
import { useAuthStore } from '@/lib/auth';

export default function SpotifyPlayer() {
  const { user } = useAuthStore();
  const [ready, setReady] = useState(false);
  const [state, setState] = useState<Spotify.PlaybackState | null>(null);
  const [localPositionMs, setLocalPositionMs] = useState(0);
  const rafRef = useRef<number | null>(null);
  const rafBaseRef = useRef<{ startTime: number; basePosition: number } | null>(null);

  useEffect(() => {
    if (!user?.spotifyConnected) return;
    initSpotifyPlayer();
    return onPlayerReady(setReady);
  }, [user?.spotifyConnected]);

  useEffect(() => {
    if (!ready) return;
    const p = getPlayer();
    if (!p) return;

    // Sync state on any event
    p.addListener('player_state_changed', (s) => {
      setState(s);
      if (s) setLocalPositionMs(s.position);
    });

    // Poll every 500ms to keep position accurate
    const poll = setInterval(async () => {
      const s = await getPlayer()?.getCurrentState();
      if (!s) return;
      setState(s);
      setLocalPositionMs(s.position);
    }, 500);

    return () => clearInterval(poll);
  }, [ready]);

  // rAF interpolation when playing so the clock looks smooth
  useEffect(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (!state || state.paused) return;

    rafBaseRef.current = { startTime: performance.now(), basePosition: state.position };

    const tick = () => {
      if (!rafBaseRef.current) return;
      const elapsed = performance.now() - rafBaseRef.current.startTime;
      setLocalPositionMs(rafBaseRef.current.basePosition + elapsed);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  // Reset rAF whenever paused state or track changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.paused, state?.track_window?.current_track?.id, state?.position]);

  if (!user?.spotifyConnected || !ready || !state) return null;

  const track = state.track_window.current_track;
  const albumArt = track.album.images[0]?.url;
  const positionMs = Math.min(localPositionMs, state.duration);
  const pct = state.duration > 0 ? (positionMs / state.duration) * 100 : 0;

  function fmt(ms: number) {
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-white/5 bg-surface-1/95 backdrop-blur-md">
      <div className="mx-auto flex max-w-4xl items-center gap-4 px-4 py-3">
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

        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold text-white">{track.name}</p>
          <p className="truncate text-xs text-white/40">{track.artists.map((a) => a.name).join(', ')}</p>
        </div>

        <button
          onClick={() => (state.paused ? getPlayer()?.resume() : getPlayer()?.pause())}
          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-accent/20 text-accent transition hover:bg-accent/30"
        >
          {state.paused ? <Play size={14} fill="currentColor" /> : <Pause size={14} fill="currentColor" />}
        </button>

        <div className="hidden w-36 sm:block">
          <div className="mb-1 h-1 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
          </div>
          <div className="flex justify-between text-[10px] text-white/30">
            <span>{fmt(positionMs)}</span>
            <span>{fmt(state.duration)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
