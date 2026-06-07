import api from './api';

// Singleton state — shared across components without React context
let player: Spotify.Player | null = null;
let deviceId: string | null = null;
let currentSpotifyId: string | null = null;
let tokenExpiresAt = 0;
let cachedToken: string | null = null;

type ReadyCallback = (ready: boolean) => void;
const readyListeners: Set<ReadyCallback> = new Set();

function notifyReady(ready: boolean) {
  readyListeners.forEach((fn) => fn(ready));
}

export function onPlayerReady(fn: ReadyCallback) {
  readyListeners.add(fn);
  // immediately call with current state
  fn(!!deviceId);
  return () => { readyListeners.delete(fn); };
}

export function isPlayerReady() {
  return !!deviceId;
}

async function getFreshToken(): Promise<string | null> {
  if (cachedToken && Date.now() < tokenExpiresAt - 30_000) return cachedToken;
  try {
    const { data } = await api.get<{ accessToken: string; expiresAt: string }>('/api/auth/spotify/token');
    cachedToken = data.accessToken;
    tokenExpiresAt = new Date(data.expiresAt).getTime();
    return cachedToken;
  } catch {
    return null;
  }
}

export async function initSpotifyPlayer(): Promise<void> {
  if (player) return;

  const token = await getFreshToken();
  if (!token) return;

  // Load SDK script if not already loaded
  if (!window.Spotify) {
    // IMPORTANT: set the callback BEFORE adding the script tag —
    // the SDK fires window.onSpotifyWebPlaybackSDKReady the moment it loads.
    await new Promise<void>((resolve) => {
      window.onSpotifyWebPlaybackSDKReady = resolve;
      const script = document.createElement('script');
      script.src = 'https://sdk.scdn.co/spotify-player.js';
      document.head.appendChild(script);
    });
  }

  player = new window.Spotify.Player({
    name: 'SongScope',
    getOAuthToken: async (cb) => {
      const t = await getFreshToken();
      if (t) cb(t);
    },
    volume: 0.8,
  });

  player.addListener('ready', ({ device_id }) => {
    console.log('[SongScope] Spotify player ready, device:', device_id);
    deviceId = device_id;
    notifyReady(true);
  });

  player.addListener('not_ready', ({ device_id }) => {
    console.warn('[SongScope] Spotify player not ready, device:', device_id);
    deviceId = null;
    notifyReady(false);
  });

  player.addListener('player_state_changed', (state) => {
    if (!state) return;
    currentSpotifyId = state.track_window.current_track.id;
  });

  // Log any SDK errors
  player.addListener('initialization_error', (e) => console.error('[Spotify] init error:', e));
  player.addListener('authentication_error', (e) => console.error('[Spotify] auth error:', e));
  player.addListener('account_error', (e) => console.error('[Spotify] account error (Premium required?):', e));
  player.addListener('playback_error', (e) => console.error('[Spotify] playback error:', e));

  player.connect();
}

export async function playTrackAt(spotifyId: string, positionMs: number): Promise<void> {
  if (!deviceId) return;
  const token = await getFreshToken();
  if (!token) return;

  // Always transfer playback to our device first — this makes SongScope
  // the active device even if something else is playing on another client.
  await fetch('https://api.spotify.com/v1/me/player', {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ device_ids: [deviceId], play: false }),
  });

  const uri = `spotify:track:${spotifyId}`;

  // Load track at position (works whether or not it was already loaded)
  const res = await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ uris: [uri], position_ms: positionMs }),
  });

  if (res.ok) {
    currentSpotifyId = spotifyId;
  } else {
    const err = await res.json().catch(() => ({}));
    console.error('Spotify play error:', res.status, err);
  }
}

export async function pausePlayer(): Promise<void> {
  player?.pause();
}

export function getPlayer() {
  return player;
}
