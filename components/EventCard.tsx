'use client';

import Link from 'next/link';
import { motion } from 'motion/react';
import { inr, type EventCard as EventCardType } from '@/lib/api';

/** Shared catalogue card used on the landing page and the browse page. */
export default function EventCard({ ev }: { ev: EventCardType }) {
  return (
    <motion.div
      variants={{
        hidden: { opacity: 0, y: 24 },
        show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 220, damping: 24 } },
      }}
      whileHover={{ y: -6 }}
    >
      <Link href={`/events/${ev.id}`} className="glass glass-hover group block h-full overflow-hidden rounded-2xl">
        <div className="relative h-32 overflow-hidden bg-gradient-to-br from-neon-violet/30 via-neon-indigo/20 to-neon-cyan/20">
          <div className="absolute inset-0 grid place-items-center">
            <span className="font-display text-5xl font-black opacity-20">{ev.title.charAt(0)}</span>
          </div>
          {ev.genre && <span className="pill absolute left-3 top-3 bg-ink-950/70 text-slate-200">{ev.genre}</span>}
        </div>

        <div className="p-5">
          <h3 className="font-display text-lg font-bold leading-snug group-hover:text-gradient">{ev.title}</h3>
          {ev.artist && <p className="mt-1 text-sm text-slate-400">{ev.artist}</p>}

          {ev.nextShow ? (
            <div className="mt-4 flex items-end justify-between border-t border-white/5 pt-4">
              <div>
                <p className="text-xs text-slate-500">{ev.nextShow.venue.city}</p>
                <p className="text-sm font-medium text-slate-300">
                  {new Date(ev.nextShow.startTime).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[0.65rem] uppercase tracking-wider text-slate-500">from</p>
                <p className="font-display text-lg font-bold text-neon-cyan">{inr(ev.nextShow.basePrice)}</p>
              </div>
            </div>
          ) : (
            <p className="mt-4 border-t border-white/5 pt-4 text-xs text-slate-500">No upcoming shows</p>
          )}
        </div>
      </Link>
    </motion.div>
  );
}
