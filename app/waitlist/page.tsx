'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { apiFetch } from '@/lib/api';
import Protected from '@/components/Protected';

type Entry = {
  id: number;
  showId: number;
  eventTitle: string;
  venueName: string;
  startTime: string;
  requestedQuantity: number;
  position: number;
  peopleAheadInQueue: number;
  status: string;
  promotedUntil: string | null;
  createdAt: string;
};

const statusStyle: Record<string, string> = {
  WAITING: 'border-neon-amber/40 bg-neon-amber/10 text-neon-amber',
  PROMOTED: 'border-neon-emerald/40 bg-neon-emerald/10 text-neon-emerald',
  EXPIRED: 'border-slate-500/40 bg-slate-500/10 text-slate-400',
  FULFILLED: 'border-neon-cyan/40 bg-neon-cyan/10 text-neon-cyan',
};

function Countdown({ until }: { until: string }) {
  const [left, setLeft] = useState(() => new Date(until).getTime() - Date.now());

  useEffect(() => {
    const t = setInterval(() => setLeft(new Date(until).getTime() - Date.now()), 1000);
    return () => clearInterval(t);
  }, [until]);

  if (left <= 0) return <span className="text-slate-500">offer expired</span>;
  const mins = Math.floor(left / 60000);
  const secs = Math.floor((left % 60000) / 1000);
  return (
    <span className="font-mono text-neon-emerald">
      {mins}:{String(secs).padStart(2, '0')} left to claim
    </span>
  );
}

function WaitlistInner() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<{ entries: Entry[] }>('/waitlist')
      .then((d) => setEntries(d.entries))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="h-48 rounded-3xl shimmer" />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-4xl font-bold">
          My <span className="text-gradient">waitlist</span>
        </h1>
        <p className="mt-1.5 text-sm text-slate-400">
          FIFO queue per show. A trigger promotes the next entry the moment a seat is released.
        </p>
      </div>

      {error && <div className="glass rounded-2xl border-red-500/30 p-5 text-sm text-red-300">{error}</div>}

      {entries.length === 0 ? (
        <div className="glass rounded-3xl p-14 text-center">
          <p className="font-display text-xl font-bold">You&apos;re not waiting on anything</p>
          <p className="mx-auto mt-2 max-w-sm text-sm text-slate-400">
            When a show is sold out you can join its waitlist, and you&apos;ll be offered a seat automatically if one
            frees up.
          </p>
          <Link href="/events" className="btn-neon mt-5 inline-flex">
            Browse events
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {entries.map((e, i) => (
            <motion.div
              key={e.id}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="glass rounded-2xl p-6"
            >
              <div className="flex flex-wrap items-center justify-between gap-5">
                <div>
                  <span className={`pill border ${statusStyle[e.status] ?? statusStyle.WAITING}`}>{e.status}</span>
                  <h3 className="font-display mt-2.5 text-lg font-bold">{e.eventTitle}</h3>
                  <p className="text-sm text-slate-400">
                    {e.venueName} ·{' '}
                    {new Date(e.startTime).toLocaleString('en-IN', {
                      day: 'numeric',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                  <p className="mt-2 text-xs text-slate-500">
                    Requested {e.requestedQuantity} seat{e.requestedQuantity > 1 ? 's' : ''}
                    {e.status === 'PROMOTED' && e.promotedUntil && (
                      <>
                        {' · '}
                        <Countdown until={e.promotedUntil} />
                      </>
                    )}
                  </p>
                </div>

                <div className="text-center">
                  <p className="text-[0.65rem] uppercase tracking-wider text-slate-500">Position</p>
                  <p className="font-display text-4xl font-extrabold text-gradient">#{e.position}</p>
                  <p className="text-[0.68rem] text-slate-500">
                    {e.peopleAheadInQueue} ahead of you
                  </p>
                </div>

                <Link href={`/shows/${e.showId}`} className="btn-ghost">
                  View show
                </Link>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function WaitlistPage() {
  return (
    <Protected roles={['customer', 'manager', 'admin']}>
      <WaitlistInner />
    </Protected>
  );
}
