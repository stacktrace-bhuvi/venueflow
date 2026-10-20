'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { motion, type Variants } from 'motion/react';
import { apiFetch, type EventCard as EventCardType, type Pagination } from '@/lib/api';
import EventCard from '@/components/EventCard';

/* staggered entrance for lists */
const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } },
};
const item: Variants = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 220, damping: 24 } },
};

const capabilities = [
  {
    icon: '⚡',
    title: 'Dynamic pricing',
    body: 'A PL/pgSQL function prices every seat live from demand signals aggregated in MongoDB.',
    accent: 'from-neon-violet to-neon-indigo',
  },
  {
    icon: '🔒',
    title: 'Atomic seat locking',
    body: 'SELECT … FOR UPDATE inside a transaction makes double-booking impossible under load.',
    accent: 'from-neon-cyan to-neon-indigo',
  },
  {
    icon: '🔁',
    title: 'Automated waitlist',
    body: 'A trigger promotes the next person in the queue the instant a seat is released.',
    accent: 'from-neon-pink to-neon-violet',
  },
  {
    icon: '🔍',
    title: 'Full-text search',
    body: 'Weighted tsvector columns with a GIN index rank shows, artists and venues instantly.',
    accent: 'from-neon-amber to-neon-pink',
  },
];

export default function HomePage() {
  const [events, setEvents] = useState<EventCardType[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<{ events: EventCardType[]; pagination: Pagination }>('/events?limit=6')
      .then((d) => {
        setEvents(d.events);
        setTotal(d.pagination.total);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-24">
      {/* ---------------- hero ---------------- */}
      <section className="relative pt-10 text-center">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        >
          <span className="pill border border-neon-violet/30 bg-neon-violet/10 text-neon-violet">
            <span className="h-1.5 w-1.5 rounded-full bg-neon-violet animate-pulse-glow" />
            Live demand-based pricing
          </span>

          <h1 className="font-display mx-auto mt-6 max-w-4xl text-5xl font-extrabold leading-[1.05] tracking-tight sm:text-7xl">
            Every seat,
            <br />
            <span className="text-gradient">priced by the moment.</span>
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-slate-400 sm:text-lg">
            Seat-level booking across a chain of venues, with prices that move on real demand and a
            waitlist that fills itself the second a ticket is released.
          </p>

          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <Link href="/events" className="btn-neon">
              Browse events
              <span aria-hidden>&rarr;</span>
            </Link>
            <Link href="/register" className="btn-ghost">
              Create an account
            </Link>
          </div>
        </motion.div>

        {/* floating stat chips */}
        <motion.div
          variants={container}
          initial="hidden"
          animate="show"
          className="mx-auto mt-14 grid max-w-3xl grid-cols-2 gap-4 sm:grid-cols-4"
        >
          {[
            { k: total ? `${total}` : '—', v: 'Live events' },
            { k: '3', v: 'User roles' },
            { k: '14', v: 'SQL tables' },
            { k: '2', v: 'Databases' },
          ].map((s) => (
            <motion.div key={s.v} variants={item} className="glass rounded-2xl px-4 py-5">
              <p className="font-display text-3xl font-bold text-gradient">{s.k}</p>
              <p className="mt-1 text-xs uppercase tracking-wider text-slate-500">{s.v}</p>
            </motion.div>
          ))}
        </motion.div>
      </section>

      {/* ---------------- capabilities ---------------- */}
      <section>
        <motion.div
          variants={container}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '-80px' }}
          className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4"
        >
          {capabilities.map((c) => (
            <motion.div
              key={c.title}
              variants={item}
              whileHover={{ y: -6 }}
              className="glass glass-hover rounded-2xl p-6"
            >
              <div
                className={`mb-4 grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br ${c.accent} text-xl`}
              >
                {c.icon}
              </div>
              <h3 className="font-display text-base font-bold">{c.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">{c.body}</p>
            </motion.div>
          ))}
        </motion.div>
      </section>

      {/* ---------------- live events ---------------- */}
      <section>
        <div className="mb-7 flex items-end justify-between">
          <div>
            <h2 className="font-display text-3xl font-bold">Happening soon</h2>
            <p className="mt-1.5 text-sm text-slate-400">Straight from the live catalogue.</p>
          </div>
          <Link href="/events" className="text-sm font-semibold text-neon-violet hover:text-neon-cyan">
            View all &rarr;
          </Link>
        </div>

        {loading && (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-60 rounded-2xl shimmer" />
            ))}
          </div>
        )}

        {error && (
          <div className="glass rounded-2xl border-red-500/30 p-6 text-sm text-red-300">
            Couldn&apos;t load events: {error}
          </div>
        )}

        {!loading && !error && events.length === 0 && (
          <div className="glass rounded-2xl p-10 text-center text-sm text-slate-400">
            No events yet. Run <code className="text-neon-cyan">npm run db:seed</code> to load the sample catalogue.
          </div>
        )}

        {!loading && events.length > 0 && (
          <motion.div
            variants={container}
            initial="hidden"
            animate="show"
            className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3"
          >
            {events.map((ev) => (
              <EventCard key={ev.id} ev={ev} />
            ))}
          </motion.div>
        )}
      </section>
    </div>
  );
}
