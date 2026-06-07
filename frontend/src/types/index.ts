export interface User {
  id: string;
  email: string;
  username: string;
  bio?: string;
  createdAt: string;
  spotifyConnected?: boolean;
}

export interface Song {
  id: string;
  spotifyId: string;
  title: string;
  artist: string;
  album: string;
  albumArtUrl: string | null;
  durationMs: number;
  previewUrl: string | null;
  popularity: number | null;
  releaseDate: string | null;
  createdAt: string;
}

export interface SongRating {
  id: string;
  userId: string;
  songId: string;
  rating: number;
  createdAt: string;
  updatedAt: string;
}

export interface IntervalRating {
  id: string;
  userId: string;
  songId: string;
  startMs: number;
  endMs: number;
  rating: number;
  createdAt: string;
  updatedAt: string;
}

export interface TimelinePoint {
  ms: number;
  value: number | null; // null = unrated gap
  ratingCount: number;
}

export interface SongStats {
  avgRating: number | null;
  ratingCount: number;
  intervalCount: number;
  contributorCount: number;
}

export interface SongDetail {
  song: Song;
  stats: SongStats;
  timeline: TimelinePoint[];
  userRating: number | null;
  userIntervals: IntervalRating[];
}

export interface SpotifyTrackResult {
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
