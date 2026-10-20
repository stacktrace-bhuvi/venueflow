'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'motion/react';
import { useState } from 'react';
import { useAuth } from '@/lib/auth-context';

const customerLinks = [
  { href: '/events', label: 'Browse' },
  { href: '/bookings', label: 'My Bookings' },
  { href: '/waitlist', label: 'Waitlist' },
];

export default function Nav() {
  const { user, loading, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  // role-aware link set
  const links = [...customerLinks];
  if (user?.role === 'manager' || user?.role === 'admin') {
    links.push({ href: '/manager', label: 'Manager' });
  }
  if (user?.role === 'admin') {
    links.push({ href: '/admin', label: 'Admin' });
  }

  async function handleLogout() {
    await logout();
    router.push('/');
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-50 border-b border-white/5 bg-ink-950/70 backdrop-blur-xl">
      <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5">
        {/* brand */}
        <Link href="/" className="group flex items-center gap-2.5">
          <motion.span
            whileHover={{ rotate: 12, scale: 1.1 }}
            transition={{ type: 'spring', stiffness: 400, damping: 12 }}
            className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-neon-violet to-neon-indigo text-lg font-black shadow-lg shadow-neon-violet/40"
          >
            V
          </motion.span>
          <span className="font-display text-lg font-bold tracking-tight">
            Venue<span className="text-gradient">Flow</span>
          </span>
        </Link>

        {/* desktop links */}
        <div className="hidden items-center gap-1 md:flex">
          {links.map((l) => {
            const active = pathname === l.href || pathname.startsWith(l.href + '/');
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`relative rounded-lg px-3.5 py-2 text-sm font-medium transition-colors ${
                  active ? 'text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                {active && (
                  <motion.span
                    layoutId="nav-active"
                    className="absolute inset-0 rounded-lg bg-white/10"
                    transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                  />
                )}
                <span className="relative">{l.label}</span>
              </Link>
            );
          })}
        </div>

        {/* auth area */}
        <div className="flex items-center gap-2.5">
          {loading ? (
            <div className="h-9 w-24 rounded-lg shimmer" />
          ) : user ? (
            <div className="flex items-center gap-2.5">
              <div className="hidden text-right sm:block">
                <p className="text-sm font-semibold leading-tight">{user.fullName}</p>
                <p className="text-[0.68rem] uppercase tracking-wider text-neon-violet">{user.role}</p>
              </div>
              <div className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-neon-violet to-neon-pink text-sm font-bold">
                {user.fullName.charAt(0).toUpperCase()}
              </div>
              <button onClick={handleLogout} className="btn-ghost !px-3 !py-1.5 text-xs">
                Log out
              </button>
            </div>
          ) : (
            <>
              <Link href="/login" className="btn-ghost !px-3.5 !py-1.5 text-sm">
                Log in
              </Link>
              <Link href="/register" className="btn-neon !px-3.5 !py-1.5 text-sm">
                Sign up
              </Link>
            </>
          )}

          {/* mobile menu toggle */}
          <button
            onClick={() => setOpen((v) => !v)}
            aria-label="Toggle menu"
            className="grid h-9 w-9 place-items-center rounded-lg border border-white/10 md:hidden"
          >
            <span className="text-lg leading-none">{open ? '×' : '☰'}</span>
          </button>
        </div>
      </nav>

      {/* mobile drawer */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22 }}
            className="overflow-hidden border-t border-white/5 md:hidden"
          >
            <div className="flex flex-col gap-1 px-5 py-3">
              {links.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className="rounded-lg px-3 py-2 text-sm text-slate-300 hover:bg-white/5 hover:text-white"
                >
                  {l.label}
                </Link>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
