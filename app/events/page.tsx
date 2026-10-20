'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { apiFetch, track, type EventCard as EventCardType, type Pagination } from '@/lib/api';
import EventCard from '@/components/EventCard';

const GENRES = ['Rock', 'Classical', 'Electronic', 'Theater'];
const CITIES = ['Bengaluru', 'Mumbai', 'New Delhi'];

export default function EventsPage() {
  const [q, setQ] = useState('');
  const [genre, setGenre] = useState('');
  const [city, setCity] = useState('');
  const [page, setPage] = useState(1);

  const [events, setEvents] = useState<EventCardType[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // debounce the search box so we don't fire a query per keystroke
  const [debouncedQ, setDebouncedQ] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 350);
    return () => clearTimeout(t);
  }, [q]);

  // reset to page 1 whenever the filters change
  useEffect(() => setPage(1), [debouncedQ, genre, city]);

  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setLoading(true);
    setError(null);

    const params = new URLSearchParams({ page: String(page), limit: '9' });
    if (debouncedQ) params.set('q', debouncedQ);
    if (genre) params.set('genre', genre);
    if (city) params.set('city', city);

    try {
      const data = await apiFetch<{ events: EventCardType[]; pagination: Pagination }>(
        `/events?${params.toString()}`,
        { signal: ctrl.signal }
      );
      setEvents(data.events);
      setPagination(data.pagination);

      // Feed the demand engine in MongoDB. This is what moves prices —
      // without it the demand score stays flat and pricing looks static.
      if (debouncedQ || genre || city) {
        track({
          eventType: 'search',
          data: {
            query: debouncedQ || undefined,
            genre: genre || undefined,
            city: city || undefined,
            resultCount: data.pagination.total,
          },
        });
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [debouncedQ, genre, city, page]);

  useEffect(() => {
    void load();
  }, [load]);

  const clearAll = () => {
    setQ('');
    setGenre('');
    setCity('');
  };
  const hasFilters = Boolean(q || genre || city);

  return (
    <div className="space-y-8">
      {/* header + search */}
      <div>
        <motion.h1
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="font-display text-4xl font-bold"
        >
          Browse <span className="text-gradient">events</span>
        </motion.h1>
        <p className="mt-1.5 text-sm text-slate-400">
          Ranked by PostgreSQL full-text search over titles, artists, descriptions and venues.
        </p>

        <div className="relative mt-6">
          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-500">
            &#9906;
          </span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search Coldplay, Rahman, EDM, Hamlet…"
            className="field !py-3.5 !pl-11 !text-base"
            aria-label="Search events"
          />
          {q && (
            <button
              onClick={() => setQ('')}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
              aria-label="Clear search"
            >
              &times;
            </button>
          )}
        </div>

        {/* filter chips */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <FilterGroup label="Genre" options={GENRES} value={genre} onChange={setGenre} />
          <span className="mx-1 hidden h-5 w-px bg-white/10 sm:block" />
          <FilterGroup label="City" options={CITIES} value={city} onChange={setCity} />
          <AnimatePresence>
            {hasFilters && (
              <motion.button
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                onClick={clearAll}
                className="ml-auto text-xs font-semibold text-neon-pink hover:underline"
              >
                Clear all
              </motion.button>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* result count */}
      {pagination && !loading && (
        <p className="text-sm text-slate-500">
          <span className="font-semibold text-slate-300">{pagination.total}</span>{' '}
          {pagination.total === 1 ? 'event' : 'events'} found
          {debouncedQ && (
            <>
              {' '}
              for &ldquo;<span className="text-neon-cyan">{debouncedQ}</span>&rdquo;
            </>
          )}
        </p>
      )}

      {/* results */}
      {loading && (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
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
        <div className="glass rounded-3xl p-14 text-center">
          <p className="font-display text-xl font-bold">Nothing matched</p>
          <p className="mx-auto mt-2 max-w-sm text-sm text-slate-400">
            Try a different spelling, or clear the filters to see the whole catalogue.
          </p>
          {hasFilters && (
            <button onClick={clearAll} className="btn-ghost mt-5">
              Clear filters
            </button>
          )}
        </div>
      )}

      {!loading && events.length > 0 && (
        <motion.div
          key={`${debouncedQ}-${genre}-${city}-${page}`}
          initial="hidden"
          animate="show"
          variants={{ hidden: {}, show: { transition: { staggerChildren: 0.06 } } }}
          className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3"
        >
          {events.map((ev) => (
            <EventCard key={ev.id} ev={ev} />
          ))}
        </motion.div>
      )}

      {/* pagination */}
      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-4">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="btn-ghost !px-3 !py-1.5 text-sm disabled:opacity-40"
          >
            &larr; Prev
          </button>
          {Array.from({ length: pagination.totalPages }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              onClick={() => setPage(n)}
              className={`h-9 w-9 rounded-lg text-sm font-semibold transition ${
                n === page ? 'bg-neon-violet text-white' : 'text-slate-400 hover:bg-white/10 hover:text-white'
              }`}
            >
              {n}
            </button>
          ))}
          <button
            onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
            disabled={page === pagination.totalPages}
            className="btn-ghost !px-3 !py-1.5 text-sm disabled:opacity-40"
          >
            Next &rarr;
          </button>
        </div>
      )}
    </div>
  );
}

function FilterGroup({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="mr-1 text-[0.68rem] font-semibold uppercase tracking-wider text-slate-500">{label}</span>
      {options.map((o) => {
        const active = value === o;
        return (
          <button
            key={o}
            onClick={() => onChange(active ? '' : o)}
            className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
              active
                ? 'border-neon-violet bg-neon-violet/20 text-white'
                : 'border-white/10 text-slate-400 hover:border-white/25 hover:text-white'
            }`}
          >
            {o}
          </button>
        );
      })}
    </div>
  );
}
