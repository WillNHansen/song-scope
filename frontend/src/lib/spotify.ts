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
    await new Promise<void>((resolve) => {
      const script = document.createElement('script');
      script.src = 'https://sdk.scdn.co/spotify-player.js';
      script.onload = () => resolve();
      document.head.appendChild(script);
    });
    // Wait for SDK to call window.onSpotifyWebPlaybackSDKReady
    await new Promise<void>((resolve) => {
      if (window.Spotify) return resolve();
      window.onSpotifyWebPlaybackSDKReady = resolve;
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
    deviceId = device_id;
    notifyReady(true);
  });

  player.addListener('not_ready', () => {
    deviceId = null;
    notifyReady(false);
  });

  player.addListener('player_state_changed', (state) => {
    if (!state) return;
    // update currentSpotifyId from what's playing
    currentSpotifyId = state.track_window.current_track.id;
  });

  player.connect();
}

export async function playTrackAt(spotifyId: string, positionMs: number): Promise<void> {
  if (!deviceId) return;
  const token = await getFreshToken();
  if (!token) return;

  const uri = `spotify:track:${spotifyId}`;

  if (currentSpotifyId === spotifyId) {
    // Already loaded — just seek
    await fetch(`https://api.spotify.com/v1/me/player/seek?position_ms=${positionMs}&device_id=${deviceId}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}` },
    });
    await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}` },
    });
  } else {
    // Load new track and seek
    await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ uris: [uri], position_ms: positionMs }),
    });
    currentSpotifyId = spotifyId;
  }
}

export async function pausePlayer(): Promise<void> {
  player?.pause();
}

export function getPlayer() {
  return player;
}
