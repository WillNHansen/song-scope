import axios from 'axios';
import { config } from '../config';

interface SpotifyToken {
  accessToken: string;
  expiresAt: number;
}

interface SpotifyTrack {
  id: string;
  name: string;
  duration_ms: number;
  preview_url: string | null;
  popularity: number;
  album: {
    name: string;
    images: { url: string; width: number; height: number }[];
    release_date: string;
  };
  artists: { name: string }[];
}

export interface TrackMetadata {
  spotifyId: string;
  title: string;
  artist: string;
  album: string;
  albumArtUrl: string | null;
  durationMs: number;
  previewUrl: string | null;
  popularity: number;
  releaseDate: string;
}

let cachedToken: SpotifyToken | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.accessToken;
  }

  const credentials = Buffer.from(
    `${config.spotify.clientId}:${config.spotify.clientSecret}`
  ).toString('base64');

  const { data } = await axios.post(
    'https://accounts.spotify.com/api/token',
    'grant_type=client_credentials',
    {
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    }
  );

  cachedToken = {
    accessToken: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 60) * 1000,
  };

  return cachedToken.accessToken;
}

function formatTrack(track: SpotifyTrack): TrackMetadata {
  const images = track.album.images ?? [];
  const albumArtUrl = images[0]?.url ?? null;
  return {
    spotifyId: track.id,
    title: track.name,
    artist: track.artists.map((a) => a.name).join(', '),
    album: track.album.name,
    albumArtUrl,
    durationMs: track.duration_ms,
    previewUrl: track.preview_url,
    popularity: track.popularity,
    releaseDate: track.album.release_date,
  };
}

export async function searchTracks(query: string, limit = 10): Promise<TrackMetadata[]> {
  const token = await getAccessToken();
  const { data } = await axios.get('https://api.spotify.com/v1/search', {
    headers: { Authorization: `Bearer ${token}` },
    params: { q: query, type: 'track', limit, market: 'US' },
  });
  return (data.tracks.items as SpotifyTrack[]).map(formatTrack);
}

export async function getTrack(spotifyId: string): Promise<TrackMetadata> {
  const token = await getAccessToken();
  const { data } = await axios.get(`https://api.spotify.com/v1/tracks/${spotifyId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return formatTrack(data as SpotifyTrack);
}
