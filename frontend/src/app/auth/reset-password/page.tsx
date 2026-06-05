'use client';

import { useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Music2, ArrowLeft } from 'lucide-react';
import api from '@/lib/api';

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get('token') ?? '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  if (!token) {
    return (
      <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-6 text-center">
        <p className="text-red-400">Invalid reset link.</p>
        <Link href="/auth/forgot-password" className="mt-3 inline-block text-sm text-accent hover:underline">
          Request a new one
        </Link>
      </div>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setLoading(true);
    try {
      await api.post('/api/auth/reset-password', { token, password });
      setDone(true);
      setTimeout(() => router.push('/auth/login'), 2500);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg ?? 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div className="rounded-xl border border-accent/20 bg-accent/10 p-6 text-center">
        <p className="font-medium text-white">Password updated!</p>
        <p className="mt-1 text-sm text-white/50">Redirecting you to login…</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label className="mb-1 block text-sm text-white/60">New password</label>
        <input
          type="password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-lg border border-white/10 bg-surface-1 px-4 py-2.5 text-white focus:border-accent/50 focus:outline-none"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm text-white/60">Confirm password</label>
        <input
          type="password"
          required
          minLength={8}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="w-full rounded-lg border border-white/10 bg-surface-1 px-4 py-2.5 text-white focus:border-accent/50 focus:outline-none"
        />
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-lg bg-accent py-2.5 font-semibold text-white transition hover:bg-accent/80 disabled:opacity-50"
      >
        {loading ? 'Updating…' : 'Set new password'}
      </button>
      <Link
        href="/auth/login"
        className="flex items-center justify-center gap-1.5 text-sm text-white/40 hover:text-white/70"
      >
        <ArrowLeft size={14} /> Back to login
      </Link>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="flex min-h-[calc(100vh-56px)] items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <Music2 size={32} className="mx-auto mb-3 text-accent" />
          <h1 className="text-2xl font-bold">Set a new password</h1>
          <p className="mt-1 text-sm text-white/40">Must be at least 8 characters.</p>
        </div>
        <Suspense fallback={null}>
          <ResetPasswordForm />
        </Suspense>
      </div>
    </div>
  );
}
