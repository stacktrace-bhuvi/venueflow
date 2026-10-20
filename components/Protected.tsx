'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import type { Role } from '@/lib/api';

/**
 * Client-side route guard. This is convenience only — the real
 * enforcement is requireRole() in the API middleware. Hiding a button
 * is not authorisation.
 */
export default function Protected({ roles, children }: { roles: Role[]; children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const pathname = usePathname();

  if (loading) return <div className="h-64 rounded-3xl shimmer" />;

  if (!user) {
    return (
      <div className="glass rounded-3xl p-12 text-center">
        <p className="font-display text-xl font-bold">Please log in</p>
        <p className="mt-2 text-sm text-slate-400">You need an account to view this page.</p>
        <Link href={`/login?next=${pathname}`} className="btn-neon mt-5 inline-flex">
          Log in
        </Link>
      </div>
    );
  }

  if (!roles.includes(user.role)) {
    return (
      <div className="glass rounded-3xl border-red-500/25 p-12 text-center">
        <p className="font-display text-xl font-bold">Not authorised</p>
        <p className="mt-2 text-sm text-slate-400">
          This area needs the <span className="text-neon-violet">{roles.join(' or ')}</span> role. You are signed in
          as <span className="text-neon-cyan">{user.role}</span>.
        </p>
        <Link href="/events" className="btn-ghost mt-5 inline-flex">
          Back to browse
        </Link>
      </div>
    );
  }

  return <>{children}</>;
}
