'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth';
import { Music2, User, LogOut } from 'lucide-react';

export default function Navbar() {
  const { user, logout } = useAuthStore();
  const router = useRouter();

  function handleLogout() {
    logout();
    router.push('/');
  }

  return (
    <nav className="sticky top-0 z-50 border-b border-white/5 bg-surface/90 backdrop-blur">
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
