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
  fn(!!deviceId); // call immediately with current state
  return () => { readyListeners.delete(fn); };
}

export function isPlayerReady() { return !!deviceId; }
export function getPlayer() { return player; }

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

  // Set the callback BEFORE adding the script — the SDK fires it immediately on load
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

async function spotifyFetch(path: string, token: string, body?: object) {
  const res = await fetch(`https://api.spotify.com/v1${path}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return res;
}

export async function playTrackAt(spotifyId: string, positionMs: number): Promise<void> {
  if (!deviceId) { console.warn('[SongScope] No device ready'); return; }
  const token = await getFreshToken();
  if (!token) return;

  const uri = `spotify:track:${spotifyId}`;

  // Attempt play; if 404, wait 1s for device to fully register then retry once
  const attempt = async () => spotifyFetch(
    `/me/player/play?device_id=${deviceId}`,
    token,
    { uris: [uri], position_ms: positionMs }
  );

  let res = await attempt();

  if (res.status === 404) {
    console.log('[SongScope] Device not ready yet, retrying in 1s…');
    await new Promise((r) => setTimeout(r, 1000));
    res = await attempt();
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    console.error('[Spotify] play failed:', res.status, err);
  }
}

export async function pausePlayer() { player?.pause(); }
