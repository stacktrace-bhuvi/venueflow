'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { motion } from 'motion/react';
import { useAuth } from '@/lib/auth-context';

export default function RegisterPage() {
  const { register, login } = useAuth();
  const router = useRouter();

  const [form, setForm] = useState({
    fullName: '',
    email: '',
    password: '',
    phone: '',
    role: 'customer' as 'customer' | 'manager',
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await register({
        fullName: form.fullName,
        email: form.email,
        password: form.password,
        phone: form.phone || undefined,
        role: form.role,
      });
      // register does not log you in, so do it straight away
      const user = await login(form.email, form.password);
      router.push(user.role === 'manager' ? '/manager' : '/events');
      router.refresh();
    } catch (err: any) {
      setError(err.message || 'Registration failed');
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
        <h1 className="font-display text-3xl font-bold">Create your account</h1>
        <p className="mt-1.5 text-sm text-slate-400">Book seats, join waitlists, track your tickets.</p>

        <form onSubmit={onSubmit} className="mt-7 space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">
              Full name
            </label>
            <input required value={form.fullName} onChange={set('fullName')} className="field" placeholder="Jane Doe" />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">Email</label>
            <input
              required
              type="email"
              value={form.email}
              onChange={set('email')}
              className="field"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">
              Password
            </label>
            <input
              required
              type="password"
              minLength={8}
              value={form.password}
              onChange={set('password')}
              className="field"
              placeholder="At least 8 characters"
            />
            <p className="mt-1 text-xs text-slate-500">Minimum 8 characters — enforced by the backend.</p>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">
              Phone <span className="normal-case text-slate-600">(optional)</span>
            </label>
            <input value={form.phone} onChange={set('phone')} className="field" placeholder="+91-98xxxxxxxx" />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">
              Account type
            </label>
            <div className="grid grid-cols-2 gap-2">
              {(['customer', 'manager'] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, role: r }))}
                  className={`rounded-xl border px-3 py-2.5 text-sm font-semibold capitalize transition ${
                    form.role === r
                      ? 'border-neon-violet bg-neon-violet/15 text-white'
                      : 'border-white/10 text-slate-400 hover:border-white/25'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
            <p className="mt-1 text-xs text-slate-500">Admin accounts are seed-only and cannot be self-registered.</p>
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
            {busy ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        <p className="mt-5 text-center text-sm text-slate-400">
          Already registered?{' '}
          <Link href="/login" className="font-semibold text-neon-violet hover:text-neon-cyan">
            Log in
          </Link>
        </p>
      </div>
    </motion.div>
  );
}
