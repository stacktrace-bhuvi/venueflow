'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { motion } from 'motion/react';
import { useAuth } from '@/lib/auth-context';

/** Seeded accounts — handy during the demo, remove before final submission. */
const demoAccounts = [
  { label: 'Customer', email: 'arjun.sharma@example.com' },
  { label: 'Manager', email: 'manager.kanteerava@venueflow.com' },
  { label: 'Admin', email: 'admin@venueflow.com' },
];

function LoginForm() {
  const { login } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next') || '/events';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const user = await login(email, password);
      // send each role to the place it actually works
      if (user.role === 'admin') router.push('/admin');
      else if (user.role === 'manager') router.push('/manager');
      else router.push(next);
      router.refresh();
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="mx-auto max-w-md"
    >
      <div className="glass rounded-3xl p-8">
        <h1 className="font-display text-3xl font-bold">Welcome back</h1>
        <p className="mt-1.5 text-sm text-slate-400">Log in to book seats and track your waitlist.</p>

        <form onSubmit={onSubmit} className="mt-7 space-y-4">
          <div>
            <label htmlFor="email" className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="field"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label htmlFor="password" className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="field"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <motion.p
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300"
            >
              {error}
            </motion.p>
          )}

          <button type="submit" disabled={busy} className="btn-neon w-full">
            {busy ? 'Signing in…' : 'Log in'}
          </button>
        </form>

        <p className="mt-5 text-center text-sm text-slate-400">
          No account?{' '}
          <Link href="/register" className="font-semibold text-neon-violet hover:text-neon-cyan">
            Create one
          </Link>
        </p>
      </div>

      {/* quick-fill for the demo */}
      <div className="glass mt-4 rounded-2xl p-4">
        <p className="mb-2.5 text-[0.68rem] font-semibold uppercase tracking-wider text-slate-500">
          Seeded demo accounts
        </p>
        <div className="flex flex-wrap gap-2">
          {demoAccounts.map((a) => (
            <button
              key={a.email}
              type="button"
              onClick={() => setEmail(a.email)}
              className="btn-ghost !px-3 !py-1.5 text-xs"
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>
    </motion.div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="mx-auto h-96 max-w-md rounded-3xl shimmer" />}>
      <LoginForm />
    </Suspense>
  );
}
