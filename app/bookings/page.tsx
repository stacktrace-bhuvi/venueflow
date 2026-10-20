'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { apiFetch, inr } from '@/lib/api';
import Protected from '@/components/Protected';

type Booking = {
  id: number;
  bookingReference: string;
  totalAmount: number;
  status: string;
  createdAt: string;
  show: { id: number; startTime: string; eventTitle: string; venueName: string };
  payment: { transactionReference: string; method: string; status: string } | null;
  seats: { seatId: number; row: string; seatNumber: number; section: string; pricePaid: number }[];
};

const statusStyle: Record<string, string> = {
  CONFIRMED: 'border-neon-emerald/40 bg-neon-emerald/10 text-neon-emerald',
  CANCELLED: 'border-slate-500/40 bg-slate-500/10 text-slate-400',
  PENDING: 'border-neon-amber/40 bg-neon-amber/10 text-neon-amber',
};

function BookingsInner() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<number | null>(null);
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await apiFetch<{ bookings: Booking[] }>('/bookings');
      setBookings(d.bookings);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function cancel(id: number) {
    setCancelling(id);
    setConfirmId(null);
    setNotice(null);
    try {
      const res = await apiFetch<{ refundAmount: number; releasedSeatCount: number }>(`/bookings/${id}/cancel`, {
        method: 'POST',
      });
      setNotice(
        `Booking cancelled. ${inr(res.refundAmount)} refunded and ${res.releasedSeatCount} seat(s) released — the waitlist trigger has run.`
      );
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setCancelling(null);
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        {[0, 1].map((i) => (
          <div key={i} className="h-36 rounded-2xl shimmer" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-4xl font-bold">
          My <span className="text-gradient">bookings</span>
        </h1>
        <p className="mt-1.5 text-sm text-slate-400">
          Cancelling releases your seats and fires the waitlist promotion trigger.
        </p>
      </div>

      <AnimatePresence>
        {notice && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="glass rounded-2xl border-neon-emerald/30 px-5 py-3.5 text-sm text-neon-emerald"
          >
            {notice}
          </motion.div>
        )}
      </AnimatePresence>

      {error && (
        <div className="glass rounded-2xl border-red-500/30 p-5 text-sm text-red-300">{error}</div>
      )}

      {bookings.length === 0 ? (
        <div className="glass rounded-3xl p-14 text-center">
          <p className="font-display text-xl font-bold">No bookings yet</p>
          <p className="mt-2 text-sm text-slate-400">Find a show and grab some seats.</p>
          <Link href="/events" className="btn-neon mt-5 inline-flex">
            Browse events
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {bookings.map((b, i) => {
            const cancelled = b.status === 'CANCELLED';
            return (
              <motion.div
                key={b.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className={`glass rounded-2xl p-6 ${cancelled ? 'opacity-60' : ''}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-5">
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <span className={`pill border ${statusStyle[b.status] ?? statusStyle.PENDING}`}>{b.status}</span>
                      <span className="font-mono text-xs text-slate-500">{b.bookingReference}</span>
                    </div>

                    <h3 className="font-display mt-2.5 text-lg font-bold">{b.show.eventTitle}</h3>
                    <p className="text-sm text-slate-400">
                      {b.show.venueName} ·{' '}
                      {new Date(b.show.startTime).toLocaleString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>

                    {b.seats?.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {b.seats.map((s, idx) => (
                          <span key={idx} className="pill bg-white/5 text-slate-300">
                            {s.section} {s.row}
                            {s.seatNumber}
                            {s.pricePaid != null && (
                              <span className="text-slate-500">· {inr(s.pricePaid)}</span>
                            )}
                          </span>
                        ))}
                      </div>
                    )}

                    {b.payment && (
                      <p className="mt-3 text-[0.68rem] text-slate-500">
                        {b.payment.method} · {b.payment.transactionReference} · {b.payment.status}
                      </p>
                    )}
                  </div>

                  <div className="text-right">
                    <p className="font-display text-2xl font-bold text-gradient">{inr(b.totalAmount)}</p>
                    <p className="mt-0.5 text-[0.68rem] text-slate-500">
                      booked {new Date(b.createdAt).toLocaleDateString('en-IN')}
                    </p>

                    {!cancelled && (
                      <div className="mt-4">
                        {confirmId === b.id ? (
                          <div className="flex gap-2">
                            <button
                              onClick={() => cancel(b.id)}
                              disabled={cancelling === b.id}
                              className="rounded-lg bg-red-500/90 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-500"
                            >
                              {cancelling === b.id ? 'Cancelling…' : 'Yes, cancel'}
                            </button>
                            <button onClick={() => setConfirmId(null)} className="btn-ghost !px-3 !py-1.5 text-xs">
                              Keep
                            </button>
                          </div>
                        ) : (
                          <button onClick={() => setConfirmId(b.id)} className="btn-ghost !px-3 !py-1.5 text-xs">
                            Cancel booking
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function BookingsPage() {
  return (
    <Protected roles={['customer', 'manager', 'admin']}>
      <BookingsInner />
    </Protected>
  );
}
