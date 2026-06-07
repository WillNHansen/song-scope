'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, Suspense } from 'react';
import { useAuthStore } from '@/lib/auth';
import { Music2, User, LogOut } from 'lucide-react';
import { initSpotifyPlayer, clearSpotifyCache } from '@/lib/spotify';
import { getToken } from '@/lib/token';

function SpotifyIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
    </svg>
  );
}

// Isolated component so useSearchParams is inside a Suspense boundary
function SpotifyCallbackHandler() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { hydrate } = useAuthStore();

  useEffect(() => {
    const spotifyParam = searchParams.get('spotify');
    if (spotifyParam === 'connected') {
      hydrate().then(() => {
        initSpotifyPlayer();
        router.replace('/');
      });
    } else if (spotifyParam === 'error') {
      router.replace('/');
    }
  }, [searchParams, hydrate, router]);

  return null;
}

export default function Navbar() {
  const { user, logout, hydrate } = useAuthStore();
  const router = useRouter();
  const backendUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

  useEffect(() => {
    if (user?.spotifyConnected) initSpotifyPlayer();
  }, [user?.spotifyConnected]);

  function handleLogout() {
    logout();
    router.push('/');
  }

  async function handleDisconnectSpotify() {
    clearSpotifyCache(); // clear in-memory token + disconnect SDK player
    await fetch(`${backendUrl}/api/auth/spotify/disconnect`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
    });
    await hydrate(); // refresh user so spotifyConnected becomes false
  }

  return (
    <nav className="sticky top-0 z-50 border-b border-white/5 bg-surface/90 backdrop-blur">
      <Suspense fallback={null}>
        <SpotifyCallbackHandler />
      </Suspense>
      <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
        <Link href="/" className="flex items-center gap-2 font-bold text-white">
          <Music2 size={22} className="text-accent" />
          <span className="tracking-tight">
            Song<span className="text-accent">Scope</span>
          </span>
        </Link>

        <div className="flex items-center gap-3">
          {user ? (
            <>
              {user.spotifyConnected ? (
                <button
                  onClick={handleDisconnectSpotify}
                  className="group flex items-center gap-1.5 rounded-lg border border-transparent px-3 py-1.5 text-xs text-green-400/70 transition hover:border-red-500/30 hover:text-red-400"
                  title="Disconnect Spotify"
                >
                  <SpotifyIcon size={13} />
                  <span className="hidden sm:inline group-hover:hidden">Connected</span>
                  <span className="hidden sm:group-hover:inline">Disconnect</span>
                </button>
              ) : (
                <a
                  href={`${backendUrl}/api/auth/spotify/connect?token=${getToken()}`}
                  className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-white/50 transition hover:border-green-500/40 hover:text-green-400"
                >
                  <SpotifyIcon size={13} />
                  <span className="hidden sm:inline">Connect Spotify</span>
                </a>
              )}

              <Link
                href={`/profile/${user.username}`}
                className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm text-white/70 transition hover:bg-surface-2 hover:text-white"
              >
                <User size={16} />
                {user.username}
              </Link>
              <button
                onClick={handleLogout}
                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-white/40 transition hover:text-white/70"
              >
                <LogOut size={16} />
              </button>
            </>
          ) : (
            <>
              <Link
                href="/auth/login"
                className="rounded-lg px-3 py-1.5 text-sm text-white/70 transition hover:text-white"
              >
                Log in
              </Link>
              <Link
                href="/auth/register"
                className="rounded-lg bg-accent px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-accent/80"
              >
                Sign up
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
