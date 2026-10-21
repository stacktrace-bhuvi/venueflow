'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { apiFetch, inr, track } from '@/lib/api';

type Show = {
  id: number;
  startTime: string;
  endTime: string;
  basePrice: number;
  minPrice: number | null;
  maxPrice: number | null;
  status: string;
  availableSeats: number;
  totalSeats: number;
  venue: { id: number; name: string; address: string; city: string; state: string; totalCapacity: number };
};

type EventDetail = {
  id: number;
  title: string;
  description: string | null;
  artist: string | null;
  genre: string | null;
  durationMinutes: number | null;
  isActive: boolean;
  organizer: { name: string; email: string };
  shows: Show[];
};

export default function EventDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [event, setEvent] = useState<EventDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<{ event: EventDetail }>(`/events/${id}`)
      .then((d) => {
        setEvent(d.event);
        // demand signal -> MongoDB
        track({
          eventType: 'view',
          data: {
            eventId: d.event.id,
            showId: d.event.shows[0]?.id,
            venueId: d.event.shows[0]?.venue.id,
            source: 'event_detail',
          },
        });
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-56 rounded-3xl shimmer" />
        <div className="h-32 rounded-2xl shimmer" />
      </div>
    );
  }

  if (error || !event) {
    return (
      <div className="glass rounded-3xl p-12 text-center">
        <p className="font-display text-xl font-bold">Event not found</p>
        <p className="mt-2 text-sm text-slate-400">{error}</p>
        <Link href="/events" className="btn-ghost mt-5 inline-flex">
          Back to browse
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      <Link href="/events" className="text-sm text-slate-400 hover:text-white">
        &larr; Back to browse
      </Link>

      {/* hero */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass relative overflow-hidden rounded-3xl p-8 sm:p-10"
      >
        <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-neon-violet/25 blur-[90px]" />
        <div className="relative">
          <div className="flex flex-wrap items-center gap-2">
            {event.genre && (
              <span className="pill border border-neon-violet/30 bg-neon-violet/10 text-neon-violet">
                {event.genre}
              </span>
            )}
            {event.durationMinutes && (
              <span className="pill bg-white/5 text-slate-300">{event.durationMinutes} min</span>
            )}
          </div>

          <h1 className="font-display mt-4 max-w-3xl text-4xl font-extrabold leading-tight sm:text-5xl">
            {event.title}
          </h1>
          {event.artist && <p className="mt-2 text-lg text-neon-cyan">{event.artist}</p>}
          {event.description && (
            <p className="mt-5 max-w-2xl text-sm leading-relaxed text-slate-400">{event.description}</p>
          )}
          <p className="mt-6 text-xs text-slate-500">
            Organised by <span className="text-slate-300">{event.organizer.name}</span>
          </p>
        </div>
      </motion.section>

      {/* shows */}
      <section>
        <h2 className="font-display text-2xl font-bold">
          Choose a <span className="text-gradient">showtime</span>
        </h2>
        <p className="mt-1.5 text-sm text-slate-400">
          Live availability straight from the <code className="text-neon-cyan">show_seats</code> table.
        </p>

        <div className="mt-6 space-y-3">
          {event.shows.length === 0 && (
            <div className="glass rounded-2xl p-8 text-center text-sm text-slate-400">
              No shows scheduled for this event yet.
            </div>
          )}

          {event.shows.map((show, i) => {
            const soldOut = show.availableSeats === 0;
            const pct = show.totalSeats ? ((show.totalSeats - show.availableSeats) / show.totalSeats) * 100 : 0;
            const past = new Date(show.startTime) < new Date();

            return (
              <motion.div
                key={show.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.06 }}
                className="glass glass-hover rounded-2xl p-5"
              >
                <div className="flex flex-wrap items-center justify-between gap-5">
                  {/* when + where */}
                  <div className="min-w-[13rem] flex-1">
                    <p className="font-display text-lg font-bold">
                      {new Date(show.startTime).toLocaleDateString('en-IN', {
                        weekday: 'short',
                        day: 'numeric',
                        month: 'long',
                      })}
                    </p>
                    <p className="text-sm text-slate-400">
                      {new Date(show.startTime).toLocaleTimeString('en-IN', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}{' '}
                      · {show.venue.name}, {show.venue.city}
                    </p>
                  </div>

                  {/* occupancy */}
                  <div className="min-w-[11rem] flex-1">
                    <div className="mb-1.5 flex justify-between text-xs">
                      <span className={soldOut ? 'text-neon-pink' : 'text-slate-400'}>
                        {soldOut ? 'Sold out' : `${show.availableSeats} of ${show.totalSeats} left`}
                      </span>
                      <span className="text-slate-500">{Math.round(pct)}% full</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${pct}%` }}
                        transition={{ duration: 0.8, delay: 0.2 + i * 0.06 }}
                        className={`h-full rounded-full ${
                          pct > 80
                            ? 'bg-gradient-to-r from-neon-pink to-neon-amber'
                            : 'bg-gradient-to-r from-neon-violet to-neon-cyan'
                        }`}
                      />
                    </div>
                  </div>

                  {/* price + cta */}
                  <div className="flex items-center gap-5">
                    <div className="text-right">
                      <p className="text-[0.65rem] uppercase tracking-wider text-slate-500">base</p>
                      <p className="font-display text-xl font-bold text-neon-cyan">{inr(show.basePrice)}</p>
                      {show.minPrice != null && show.maxPrice != null && (
                        <p className="text-[0.65rem] text-slate-500">
                          range {inr(show.minPrice)}–{inr(show.maxPrice)}
                        </p>
                      )}
                    </div>

                    {past ? (
                      <span className="pill bg-white/5 text-slate-500">Past</span>
                    ) : (
                      <Link href={`/shows/${show.id}`} className={soldOut ? 'btn-ghost' : 'btn-neon'}>
                        {soldOut ? 'Join waitlist' : 'Select seats'}
                      </Link>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
