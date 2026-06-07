import api from './api';

let player: Spotify.Player | null = null;
let deviceId: string | null = null;
let cachedToken: string | null = null;
let tokenExpiresAt = 0;

type ReadyCallback = (ready: boolean) => void;
const readyListeners = new Set<ReadyCallback>();

function notifyReady(ready: boolean) {
  readyListeners.forEach((fn) => fn(ready));
}

export function onPlayerReady(fn: ReadyCallback) {
  readyListeners.add(fn);
  fn(!!deviceId);
  return () => { readyListeners.delete(fn); };
}

export function getPlayer() { return player; }

// Call this when the user disconnects Spotify so the cached token is cleared
export function clearSpotifyCache() {
  cachedToken = null;
  tokenExpiresAt = 0;
  if (player) { player.disconnect(); player = null; }
  deviceId = null;
  notifyReady(false);
}

async function getFreshToken(): Promise<string | null> {
  if (cachedToken && Date.now() < tokenExpiresAt - 30_000) return cachedToken;
  try {
    const { data } = await api.get<{ accessToken: string; expiresAt: string }>('/api/auth/spotify/token');
    if (!data.accessToken) { console.error('[Spotify] token endpoint returned empty token'); return null; }
    cachedToken = data.accessToken;
    tokenExpiresAt = new Date(data.expiresAt).getTime();
    console.log('[SongScope] Got fresh Spotify token, expires:', data.expiresAt);
    return cachedToken;
  } catch (e) {
    console.error('[Spotify] Failed to fetch token:', e);
    return null;
  }
}

export async function initSpotifyPlayer(): Promise<void> {
  if (player) return;

  const token = await getFreshToken();
  if (!token) { console.warn('[SongScope] No Spotify token — cannot init player'); return; }

  // Set callback BEFORE adding script — SDK fires it immediately on load
  if (!window.Spotify) {
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
    console.log('[SongScope] Spotify ready, device:', device_id);
    deviceId = device_id;
    notifyReady(true);
  });
  player.addListener('not_ready', ({ device_id }) => {
    console.warn('[SongScope] Spotify not ready, device:', device_id);
    deviceId = null;
    notifyReady(false);
  });
  player.addListener('initialization_error', ({ message }) => console.error('[Spotify] init:', message));
  player.addListener('authentication_error', ({ message }) => console.error('[Spotify] auth:', message));
  player.addListener('account_error', ({ message }) => console.error('[Spotify] account (Premium required?):', message));
  player.addListener('playback_error', ({ message }) => console.error('[Spotify] playback:', message));

  player.connect();
}

export async function playTrackAt(spotifyId: string, positionMs: number): Promise<void> {
  if (!deviceId) { console.warn('[SongScope] No device ready'); return; }

  const token = await getFreshToken();
  if (!token) { console.error('[SongScope] No token available'); return; }

  console.log('[SongScope] Playing', spotifyId, 'at', positionMs, 'on device', deviceId);

  // Transfer playback to our device first (reactivates it if idle)
  const transfer = await fetch('https://api.spotify.com/v1/me/player', {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ device_ids: [deviceId], play: false }),
  });
  console.log('[SongScope] Transfer status:', transfer.status);

  // Play the track at the given position, retry up to 5× if device not yet ready
  for (let attempt = 1; attempt <= 5; attempt++) {
    const res = await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ uris: [`spotify:track:${spotifyId}`], position_ms: positionMs }),
    });

    if (res.ok || res.status === 204) {
      console.log('[SongScope] Play succeeded on attempt', attempt);
      return;
    }

    const err = await res.json().catch(() => ({}));
    console.error(`[SongScope] Play attempt ${attempt} failed:`, res.status, err);

    if (res.status !== 404) return; // non-retryable error
    await new Promise((r) => setTimeout(r, 1000));
  }
}

export async function pausePlayer() { player?.pause(); }
