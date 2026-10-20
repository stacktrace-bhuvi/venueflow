'use client';

import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { apiFetch, inr } from '@/lib/api';
import Protected from '@/components/Protected';

type VenueSummary = {
  venueId: number;
  venueName: string;
  city: string;
  managerName: string;
  totalShows: number;
  confirmedBookings: number;
  totalTicketRevenue: number;
  averageOccupancyPct: number;
  waitingCustomersCount: number;
};

type ShowOccupancy = {
  showId: number;
  eventTitle: string;
  venueName: string;
  startTime: string;
  basePrice: number;
  status: string;
  totalCapacity: number;
  availableSeats: number;
  bookedSeats: number;
  heldSeats: number;
  occupancyPercentage: number;
};

/** Single-hue sequential meter: length carries magnitude, not colour. */
function Meter({ pct }: { pct: number }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-white/8">
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${Math.min(100, pct)}%` }}
        transition={{ duration: 0.7, ease: 'easeOut' }}
        className="h-full rounded-full bg-chart-1"
      />
    </div>
  );
}

/** Capacity state as words + icon, never colour alone. */
function CapacityTag({ pct }: { pct: number }) {
  const state =
    pct >= 95 ? { icon: '●', label: 'At capacity' } : pct >= 75 ? { icon: '▲', label: 'Filling fast' } : { icon: '○', label: 'Open' };
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-slate-400">
      <span aria-hidden>{state.icon}</span>
      {state.label}
    </span>
  );
}

function ManagerInner() {
  const [venues, setVenues] = useState<VenueSummary[]>([]);
  const [shows, setShows] = useState<ShowOccupancy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<{ venuesSummary: VenueSummary[]; showsOccupancy: ShowOccupancy[] }>('/analytics/manager')
      .then((d) => {
        setVenues(d.venuesSummary);
        setShows(d.showsOccupancy);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="h-96 rounded-3xl shimmer" />;

  const totalRevenue = venues.reduce((s, v) => s + v.totalTicketRevenue, 0);
  const totalBookings = venues.reduce((s, v) => s + v.confirmedBookings, 0);
  const totalWaiting = venues.reduce((s, v) => s + v.waitingCustomersCount, 0);
  const avgOcc = venues.length ? venues.reduce((s, v) => s + v.averageOccupancyPct, 0) / venues.length : 0;

  return (
    <div className="space-y-9">
      <div>
        <h1 className="font-display text-4xl font-bold">
          Manager <span className="text-gradient">dashboard</span>
        </h1>
        <p className="mt-1.5 text-sm text-slate-400">
          Built on the <code className="text-neon-violet">manager_dashboard_view</code> and{' '}
          <code className="text-neon-violet">show_occupancy_view</code> SQL views.
        </p>
      </div>

      {error && <div className="glass rounded-2xl border-red-500/30 p-5 text-sm text-red-300">{error}</div>}

      {/* KPI row — hero numbers in primary ink, labels muted */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Ticket revenue', value: inr(totalRevenue) },
          { label: 'Confirmed bookings', value: String(totalBookings) },
          { label: 'Average occupancy', value: `${avgOcc.toFixed(1)}%` },
          { label: 'Customers waiting', value: String(totalWaiting) },
        ].map((k, i) => (
          <motion.div
            key={k.label}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="glass rounded-2xl p-5"
          >
            <p className="text-[0.68rem] uppercase tracking-wider text-slate-500">{k.label}</p>
            <p className="font-display mt-1.5 text-3xl font-bold">{k.value}</p>
          </motion.div>
        ))}
      </div>

      {/* venues */}
      <section>
        <h2 className="font-display text-xl font-bold">Your venues</h2>
        {venues.length === 0 ? (
          <p className="glass mt-4 rounded-2xl p-8 text-center text-sm text-slate-400">
            No venues assigned to this account yet.
          </p>
        ) : (
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {venues.map((v) => (
              <div key={v.venueId} className="glass rounded-2xl p-6">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-display text-lg font-bold">{v.venueName}</h3>
                    <p className="text-sm text-slate-400">{v.city}</p>
                  </div>
                  <p className="font-display text-xl font-bold">{inr(v.totalTicketRevenue)}</p>
                </div>

                <div className="mt-5 space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400">Average occupancy</span>
                    <span className="font-semibold">{v.averageOccupancyPct.toFixed(1)}%</span>
                  </div>
                  <Meter pct={v.averageOccupancyPct} />
                </div>

                <dl className="mt-5 grid grid-cols-3 gap-3 border-t border-white/5 pt-4 text-center">
                  {[
                    ['Shows', v.totalShows],
                    ['Bookings', v.confirmedBookings],
                    ['Waiting', v.waitingCustomersCount],
                  ].map(([label, val]) => (
                    <div key={label as string}>
                      <dt className="text-[0.65rem] uppercase tracking-wider text-slate-500">{label}</dt>
                      <dd className="font-display text-lg font-bold">{val as number}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* shows table */}
      <section>
        <h2 className="font-display text-xl font-bold">Show occupancy</h2>
        <div className="glass mt-4 overflow-x-auto rounded-2xl">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-white/8 text-[0.65rem] uppercase tracking-wider text-slate-500">
                <th className="px-5 py-3 font-semibold">Show</th>
                <th className="px-5 py-3 font-semibold">Starts</th>
                <th className="px-5 py-3 font-semibold">Base price</th>
                <th className="px-5 py-3 font-semibold">Booked / held / free</th>
                <th className="min-w-[11rem] px-5 py-3 font-semibold">Occupancy</th>
              </tr>
            </thead>
            <tbody>
              {shows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-slate-400">
                    No shows scheduled.
                  </td>
                </tr>
              )}
              {shows.map((s) => (
                <tr key={s.showId} className="border-b border-white/5 last:border-0 hover:bg-white/[0.03]">
                  <td className="px-5 py-3.5">
                    <p className="font-semibold">{s.eventTitle}</p>
                    <p className="text-xs text-slate-500">{s.venueName}</p>
                  </td>
                  <td className="px-5 py-3.5 text-slate-300">
                    {new Date(s.startTime).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                  </td>
                  <td className="px-5 py-3.5 text-slate-300">{inr(s.basePrice)}</td>
                  <td className="px-5 py-3.5 text-slate-300">
                    {s.bookedSeats} / {s.heldSeats} / {s.availableSeats}
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className="w-24">
                        <Meter pct={s.occupancyPercentage} />
                      </div>
                      <span className="w-12 text-xs font-semibold">{s.occupancyPercentage.toFixed(0)}%</span>
                      <CapacityTag pct={s.occupancyPercentage} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

export default function ManagerPage() {
  return (
    <Protected roles={['manager', 'admin']}>
      <ManagerInner />
    </Protected>
  );
}
