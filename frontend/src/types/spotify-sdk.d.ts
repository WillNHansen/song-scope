interface Window {
  Spotify: typeof Spotify;
  onSpotifyWebPlaybackSDKReady: () => void;
}

declare namespace Spotify {
  interface Player {
    connect(): Promise<boolean>;
    disconnect(): void;
    pause(): Promise<void>;
    resume(): Promise<void>;
    seek(positionMs: number): Promise<void>;
    getCurrentState(): Promise<PlaybackState | null>;
    addListener(event: 'ready', cb: (data: { device_id: string }) => void): void;
    addListener(event: 'not_ready', cb: (data: { device_id: string }) => void): void;
    addListener(event: 'player_state_changed', cb: (state: PlaybackState | null) => void): void;
    addListener(event: 'initialization_error' | 'authentication_error' | 'account_error' | 'playback_error', cb: (e: { message: string }) => void): void;
    addListener(event: string, cb: (...args: unknown[]) => void): void;
  }

  interface PlayerConstructorOptions {
    name: string;
    getOAuthToken: (cb: (token: string) => void) => void;
    volume?: number;
  }

  const Player: new (options: PlayerConstructorOptions) => Player;

  interface PlaybackState {
    paused: boolean;
    position: number;
    duration: number;
    track_window: {
      current_track: {
        id: string;
        name: string;
        artists: { name: string }[];
        album: { images: { url: string }[] };
      };
    };
  }
}
