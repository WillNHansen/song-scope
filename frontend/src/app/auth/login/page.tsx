'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Music2 } from 'lucide-react';
import api from '@/lib/api';
import { useAuthStore } from '@/lib/auth';

export default function LoginPage() {
  const router = useRouter();
  const { setAuth } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { data } = await api.post<{ user: { id: string; email: string; username: string }; token: string }>(
        '/api/auth/login',
        { email, password }
      );
      setAuth(data.user as Parameters<typeof setAuth>[0], data.token);
      router.push('/');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg ?? 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-[calc(100vh-56px)] items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <Music2 size={32} className="mx-auto mb-3 text-accent" />
          <h1 className="text-2xl font-bold">Welcome back</h1>
          <p className="mt-1 text-sm text-white/40">Log in to rate songs and shape the map.</p>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm text-white/60">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-surface-1 px-4 py-2.5 text-white placeholder:text-white/20 focus:border-accent/50 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-white/60">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-surface-1 px-4 py-2.5 text-white placeholder:text-white/20 focus:border-accent/50 focus:outline-none"
            />
          </div>
          <div className="flex justify-end">
            <Link href="/auth/forgot-password" className="text-xs text-white/40 hover:text-accent">
              Forgot password?
            </Link>
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-accent py-2.5 font-semibold text-white transition hover:bg-accent/80 disabled:opacity-50"
          >
            {loading ? 'Logging in…' : 'Log in'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-white/40">
          No account?{' '}
          <Link href="/auth/register" className="text-accent hover:underline">
            Sign up free
          </Link>
        </p>
      </div>
    </div>
  );
}
