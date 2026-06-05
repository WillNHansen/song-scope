'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Music2, ArrowLeft } from 'lucide-react';
import api from '@/lib/api';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post('/api/auth/forgot-password', { email });
      setSubmitted(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-[calc(100vh-56px)] items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <Music2 size={32} className="mx-auto mb-3 text-accent" />
          <h1 className="text-2xl font-bold">Forgot your password?</h1>
          <p className="mt-1 text-sm text-white/40">
            Enter your email and we'll send you a reset link.
          </p>
        </div>

        {submitted ? (
          <div className="rounded-xl border border-accent/20 bg-accent/10 p-6 text-center">
            <p className="font-medium text-white">Check your inbox</p>
            <p className="mt-1 text-sm text-white/50">
              If that email is registered, a reset link is on its way.
            </p>
            <Link
              href="/auth/login"
              className="mt-4 inline-flex items-center gap-1.5 text-sm text-accent hover:underline"
            >
              <ArrowLeft size={14} /> Back to login
            </Link>
          </div>
        ) : (
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
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-accent py-2.5 font-semibold text-white transition hover:bg-accent/80 disabled:opacity-50"
            >
              {loading ? 'Sending…' : 'Send reset link'}
            </button>
            <Link
              href="/auth/login"
              className="flex items-center justify-center gap-1.5 text-sm text-white/40 hover:text-white/70"
            >
              <ArrowLeft size={14} /> Back to login
            </Link>
          </form>
        )}
      </div>
    </div>
  );
}
