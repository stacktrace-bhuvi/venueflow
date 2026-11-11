'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ApiError, apiFetch, inr, track, type Seat, type ShowSeats } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';

const MAX_SEATS = 10;

type BookingResult = {
  bookingId: number;
  bookingReference: string;
  totalAmount: number;
  status: string;
  seats: { seatId: number; section: string; row: string; number: number; price: number }[];
  payment: { transactionId: string; method: string; status: string; amount: number };
};

export default function SeatMapPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();

  const [data, setData] = useState<ShowSeats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selected, setSelected] = useState<number[]>([]);
  const [holdExpiresAt, setHoldExpiresAt] = useState<string | null>(null);
  const [holdingSeat, setHoldingSeat] = useState<number | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<'CREDIT_CARD' | 'DEBIT_CARD' | 'UPI' | 'NET_BANKING'>('UPI');
  const [booking, setBooking] = useState(false);
  const [bookErr, setBookErr] = useState<string | null>(null);
  const [result, setResult] = useState<BookingResult | null>(null);

  const [waitlistQty, setWaitlistQty] = useState(2);
  const [waitlistMsg, setWaitlistMsg] = useState<string | null>(null);
  const [waitlistErr, setWaitlistErr] = useState<string | null>(null);

  const load = useCallback(
    async (quiet = false) => {
      if (!quiet) setLoading(true);
      try {
        const d = await apiFetch<ShowSeats>(`/shows/${id}/seats`);
        setData(d);
        setError(null);
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    },
    [id]
  );

  useEffect(() => {
    void load();
  }, [load]);

  // log the view once -> MongoDB demand signal
  useEffect(() => {
    if (data) track({ eventType: 'view', data: { showId: data.showId, source: 'seat_map' } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.showId]);

  /* Seat holds.
     Polls a lightweight status endpoint (not /seats, which recomputes the
     dynamic price and would write a price_history row on every poll). Merges
     each seat's current status in, so a hold another customer takes appears
     here within a few seconds. */
  const syncStatuses = useCallback(async () => {
    try {
      const d = await apiFetch<{
        seats: { seatId: number; status: Seat['status'] }[];
        myHeldSeatIds: number[];
        holdExpiresAt: string | null;
      }>(`/shows/${id}/hold`);

      const statusById = new Map(d.seats.map((x) => [x.seatId, x.status]));
      setData((prev) =>
        prev
          ? { ...prev, seats: prev.seats.map((st) => ({ ...st, status: statusById.get(st.seatId) ?? st.status })) }
          : prev
      );

      // the server is the source of truth for what we hold
      setSelected(d.myHeldSeatIds);
      setHoldExpiresAt(d.holdExpiresAt);
    } catch {
      /* polling must never break the page */
    }
  }, [id]);

  useEffect(() => {
    if (!user) return;
    void syncStatuses();
    const t = setInterval(syncStatuses, 7000);
    return () => clearInterval(t);
  }, [user, syncStatuses]);

  /* If the user picks seats and then leaves without booking, that is an
     abandoned checkout — a strong demand signal in the pricing model. */
  const selectedRef = useRef<number[]>([]);
  const bookedRef = useRef(false);
  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);
  useEffect(() => {
    return () => {
      if (!bookedRef.current && selectedRef.current.length > 0) {
        track({
          eventType: 'abandoned_checkout',
          data: { showId: Number(id), seatIds: selectedRef.current, stepReached: 'seats_selected' },
        });
        // hand the seats back rather than making everyone wait for expiry.
        // keepalive so the request still goes out as the page unloads.
        try {
          void fetch(`/api/shows/${id}/hold`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ seatIds: selectedRef.current }),
            credentials: 'include',
            keepalive: true,
          }).catch(() => {});
        } catch {
          /* best effort */
        }
      }
    };
  }, [id]);

  const seatsById = useMemo(() => {
    const m = new Map<number, Seat>();
    data?.seats.forEach((s) => m.set(s.seatId, s));
    return m;
  }, [data]);

  /* Counters derived from the live seat array, so they stay correct as holds
     appear and disappear during polling (data.stats is only a load-time snapshot). */
  const liveStats = useMemo(() => {
    const seats = data?.seats ?? [];
    const booked = seats.filter((x) => x.status === 'BOOKED').length;
    const held = seats.filter((x) => x.status === 'HELD').length;
    return {
      total: seats.length,
      available: seats.filter((x) => x.status === 'AVAILABLE').length,
      held,
      booked,
      occupancy: seats.length ? (booked + held) / seats.length : 0,
    };
  }, [data]);

  const selectedSeats = selected.map((sid) => seatsById.get(sid)).filter(Boolean) as Seat[];
  const total = selectedSeats.reduce((sum, s) => sum + s.price, 0);

  /* group seats: section -> row -> seats */
  const sections = useMemo(() => {
    if (!data) return [];
    const bySection = new Map<string, Map<string, Seat[]>>();
    for (const s of data.seats) {
      if (!bySection.has(s.section)) bySection.set(s.section, new Map());
      const rows = bySection.get(s.section)!;
      if (!rows.has(s.rowNumber)) rows.set(s.rowNumber, []);
      rows.get(s.rowNumber)!.push(s);
    }
    return Array.from(bySection.entries()).map(([name, rows]) => ({
      name,
      rows: Array.from(rows.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([label, seats]) => ({ label, seats: seats.sort((a, b) => a.seatNumber - b.seatNumber) })),
    }));
  }, [data]);

  /* Selecting a seat takes a real, exclusive hold in the database, so the
     seat immediately shows as unavailable to everyone else. Deselecting, or
     leaving the page, hands it straight back. */
  async function toggleSeat(seat: Seat) {
    if (!user) {
      router.push(`/login?next=/shows/${id}`);
      return;
    }

    const isMine = selected.includes(seat.seatId);
    if (!isMine && seat.status !== 'AVAILABLE') return;
    if (!isMine && selected.length >= MAX_SEATS) return;

    setBookErr(null);
    setHoldingSeat(seat.seatId);

    try {
      if (isMine) {
        await apiFetch(`/shows/${id}/hold`, { method: 'DELETE', body: { seatIds: [seat.seatId] } });
        setSelected((prev) => prev.filter((x) => x !== seat.seatId));
        setData((prev) =>
          prev
            ? {
                ...prev,
                seats: prev.seats.map((st) =>
                  st.seatId === seat.seatId ? { ...st, status: 'AVAILABLE' as const } : st
                ),
              }
            : prev
        );
      } else {
        const res = await apiFetch<{ holdExpiresAt: string | null }>(`/shows/${id}/hold`, {
          method: 'POST',
          body: { seatIds: [seat.seatId] },
        });
        setSelected((prev) => [...prev, seat.seatId]);
        setHoldExpiresAt(res.holdExpiresAt);
        setData((prev) =>
          prev
            ? {
                ...prev,
                seats: prev.seats.map((st) =>
                  st.seatId === seat.seatId ? { ...st, status: 'HELD' as const } : st
                ),
              }
            : prev
        );
      }
    } catch (e: any) {
      setBookErr(e.message);
      void syncStatuses(); // someone beat us to it — show the truth
    } finally {
      setHoldingSeat(null);
    }
  }

  async function confirmBooking() {
    if (!user) {
      router.push(`/login?next=/shows/${id}`);
      return;
    }
    setBooking(true);
    setBookErr(null);
    try {
      const res = await apiFetch<BookingResult>('/bookings', {
        method: 'POST',
        body: { showId: Number(id), seatIds: selected, paymentMethod },
      });
      bookedRef.current = true;
      setResult(res);
      setSelected([]);
      void load(true);
    } catch (e: any) {
      const err = e as ApiError;
      setBookErr(err.message);
      // somebody else took the seat mid-flight: refresh so the map tells the truth
      if (err.code === 'SEATS_UNAVAILABLE') {
        setSelected([]);
        void load(true);
      }
    } finally {
      setBooking(false);
    }
  }

  async function joinWaitlist() {
    if (!user) {
      router.push(`/login?next=/shows/${id}`);
      return;
    }
    setWaitlistErr(null);
    setWaitlistMsg(null);
    try {
      const res = await apiFetch<{ position: number }>(`/shows/${id}/waitlist`, {
        method: 'POST',
        body: { requestedQuantity: waitlistQty },
      });
      setWaitlistMsg(`You're #${res.position} in the queue. We'll hold a seat for you the moment one frees up.`);
    } catch (e: any) {
      setWaitlistErr(e.message);
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-28 rounded-3xl shimmer" />
        <div className="h-96 rounded-3xl shimmer" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="glass rounded-3xl p-12 text-center">
        <p className="font-display text-xl font-bold">Couldn&apos;t load this show</p>
        <p className="mt-2 text-sm text-slate-400">{error}</p>
        <Link href="/events" className="btn-ghost mt-5 inline-flex">
          Back to browse
        </Link>
      </div>
    );
  }

  const soldOut = liveStats.available === 0;
  const tierStyle: Record<string, string> = {
    NORMAL: 'border-neon-emerald/40 bg-neon-emerald/10 text-neon-emerald',
    HIGH: 'border-neon-amber/40 bg-neon-amber/10 text-neon-amber',
    VERY_HIGH: 'border-neon-pink/40 bg-neon-pink/10 text-neon-pink',
  };

  return (
    <div className="space-y-7">
      <Link href="/events" className="text-sm text-slate-400 hover:text-white">
        &larr; Back to browse
      </Link>

      {/* ---------- pricing header ---------- */}
      <motion.section
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass relative overflow-hidden rounded-3xl p-7"
      >
        <div className="absolute -right-10 -top-16 h-48 w-48 rounded-full bg-neon-cyan/20 blur-[80px]" />
        <div className="relative flex flex-wrap items-start justify-between gap-6">
          <div>
            <h1 className="font-display text-3xl font-bold">{data.eventTitle}</h1>
            <p className="mt-1.5 text-sm text-slate-400">
              {data.venueName} ·{' '}
              {new Date(data.startTime).toLocaleString('en-IN', {
                day: 'numeric',
                month: 'long',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </p>
          </div>

          <div className="text-right">
            <div className="flex items-center justify-end gap-2">
              <span className={`pill border ${tierStyle[data.pricing.demandTier] ?? tierStyle.NORMAL}`}>
                <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse-glow" />
                {data.pricing.demandTier.replace('_', ' ')} demand
              </span>
            </div>
            <p className="font-display mt-2 text-4xl font-extrabold text-gradient">
              {inr(data.pricing.currentDynamicPrice)}
            </p>
            <p className="text-xs text-slate-500">
              base {inr(data.pricing.basePrice)} · capped {inr(data.pricing.minPrice)}–
              {inr(data.pricing.maxPrice)}
            </p>
          </div>
        </div>

        {/* live stats */}
        <div className="relative mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { k: liveStats.available, v: 'Available', c: 'text-neon-emerald' },
            { k: liveStats.held, v: 'Held', c: 'text-neon-amber' },
            { k: liveStats.booked, v: 'Booked', c: 'text-neon-pink' },
            { k: `${Math.round(liveStats.occupancy * 100)}%`, v: 'Occupancy', c: 'text-neon-cyan' },
          ].map((s) => (
            <div key={s.v} className="rounded-xl bg-white/5 px-4 py-3">
              <p className={`font-display text-2xl font-bold ${s.c}`}>{s.k}</p>
              <p className="text-[0.68rem] uppercase tracking-wider text-slate-500">{s.v}</p>
            </div>
          ))}
        </div>

        <p className="relative mt-4 text-xs leading-relaxed text-slate-500">
          Price computed live by the <code className="text-neon-violet">calculate_dynamic_price</code> PL/pgSQL
          function from base fare, occupancy and demand signals aggregated in MongoDB.
        </p>
      </motion.section>

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        {/* ---------- seat map ---------- */}
        <div className="space-y-5">
          <div className="glass rounded-3xl p-6">
            {/* screen / stage */}
            <div className="mx-auto mb-8 max-w-md">
              <div className="h-1.5 rounded-full bg-gradient-to-r from-transparent via-neon-violet to-transparent" />
              <p className="mt-2 text-center text-[0.68rem] uppercase tracking-[0.3em] text-slate-500">Stage</p>
            </div>

            <div className="space-y-8 overflow-x-auto">
              {sections.map((section) => (
                <div key={section.name}>
                  <div className="mb-3 flex items-center gap-3">
                    <h3 className="font-display text-sm font-bold uppercase tracking-wider text-slate-300">
                      {section.name}
                    </h3>
                    <div className="h-px flex-1 bg-white/10" />
                  </div>

                  <div className="space-y-1.5">
                    {section.rows.map((row) => (
                      <div key={row.label} className="flex items-center gap-2">
                        <span className="w-5 shrink-0 text-center text-xs font-semibold text-slate-600">
                          {row.label}
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {row.seats.map((seat) => {
                            const isSel = selected.includes(seat.seatId);
                            const base =
                              'grid h-7 w-7 place-items-center rounded-md text-[0.6rem] font-bold transition-all';
                            const cls = isSel
                              ? 'bg-neon-violet text-white shadow-lg shadow-neon-violet/50 scale-110'
                              : seat.status === 'AVAILABLE'
                                ? 'bg-white/8 text-slate-400 border border-white/15 hover:border-neon-violet hover:text-white cursor-pointer'
                                : seat.status === 'HELD'
                                  ? 'bg-neon-amber/20 text-neon-amber border border-neon-amber/30 cursor-not-allowed'
                                  : 'bg-ink-800 text-slate-700 cursor-not-allowed';

                            return (
                              <button
                                key={seat.seatId}
                                onClick={() => toggleSeat(seat)}
                                disabled={(!isSel && seat.status !== 'AVAILABLE') || holdingSeat === seat.seatId}
                                title={
                                  isSel
                                    ? `${seat.section} ${seat.rowNumber}${seat.seatNumber} — held by you, click to release`
                                    : `${seat.section} ${seat.rowNumber}${seat.seatNumber} — ${inr(seat.price)} (${seat.status})`
                                }
                                aria-label={`Seat ${seat.rowNumber}${seat.seatNumber}, ${seat.status}`}
                                className={`${base} ${cls}`}
                              >
                                {seat.seatNumber}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* legend */}
            <div className="mt-8 flex flex-wrap items-center justify-center gap-5 border-t border-white/5 pt-5 text-xs text-slate-400">
              {[
                { c: 'bg-white/8 border border-white/15', l: 'Available' },
                { c: 'bg-neon-violet', l: 'Selected' },
                { c: 'bg-neon-amber/20 border border-neon-amber/30', l: 'Held by someone' },
                { c: 'bg-ink-800', l: 'Booked' },
              ].map((x) => (
                <span key={x.l} className="flex items-center gap-1.5">
                  <span className={`h-4 w-4 rounded ${x.c}`} />
                  {x.l}
                </span>
              ))}
              <button onClick={() => load(true)} className="ml-auto text-neon-cyan hover:underline">
                Refresh map
              </button>
            </div>
          </div>
        </div>

        {/* ---------- summary / waitlist ---------- */}
        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <AnimatePresence mode="wait">
            {result ? (
              <motion.div
                key="done"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="glass rounded-3xl border-neon-emerald/30 p-6 text-center"
              >
                <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-neon-emerald/20 text-2xl">
                  ✓
                </div>
                <h3 className="font-display mt-3 text-lg font-bold">Booking confirmed</h3>
                <p className="mt-1 font-mono text-xs text-neon-cyan">{result.bookingReference}</p>
                <p className="mt-3 text-sm text-slate-400">
                  {result.seats.length} seat{result.seats.length > 1 ? 's' : ''} ·{' '}
                  <span className="font-semibold text-white">{inr(result.totalAmount)}</span>
                </p>
                <p className="mt-1 text-[0.68rem] text-slate-500">txn {result.payment.transactionId}</p>
                <div className="mt-5 space-y-2">
                  <Link href="/bookings" className="btn-neon w-full">
                    View my bookings
                  </Link>
                  <button onClick={() => setResult(null)} className="btn-ghost w-full">
                    Book more seats
                  </button>
                </div>
              </motion.div>
            ) : soldOut ? (
              <motion.div key="wait" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="glass rounded-3xl p-6">
                <span className="pill border border-neon-pink/30 bg-neon-pink/10 text-neon-pink">Sold out</span>
                <h3 className="font-display mt-3 text-lg font-bold">Join the waitlist</h3>
                <p className="mt-1.5 text-sm text-slate-400">
                  A database trigger promotes the next person in the queue the instant a seat is released.
                </p>

                <label className="mt-5 block text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Seats wanted
                </label>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={waitlistQty}
                  onChange={(e) => setWaitlistQty(Number(e.target.value))}
                  className="field mt-1.5"
                />

                <button onClick={joinWaitlist} className="btn-neon mt-4 w-full">
                  Join waitlist
                </button>

                {waitlistMsg && (
                  <p className="mt-3 rounded-lg border border-neon-emerald/30 bg-neon-emerald/10 px-3 py-2 text-xs text-neon-emerald">
                    {waitlistMsg}
                  </p>
                )}
                {waitlistErr && (
                  <p className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                    {waitlistErr}
                  </p>
                )}
              </motion.div>
            ) : (
              <motion.div key="cart" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="glass rounded-3xl p-6">
                <h3 className="font-display text-lg font-bold">Your selection</h3>

                {selectedSeats.length === 0 ? (
                  <p className="mt-3 text-sm text-slate-500">
                    Pick up to {MAX_SEATS} seats from the map. Selecting one holds it for you, so nobody else can take
                    it while you decide.
                  </p>
                ) : (
                  <>
                    {holdExpiresAt && <HoldCountdown until={holdExpiresAt} onExpire={() => void syncStatuses()} />}

                    <ul className="mt-4 space-y-2">
                      {selectedSeats.map((s) => (
                        <motion.li
                          key={s.seatId}
                          initial={{ opacity: 0, x: 10 }}
                          animate={{ opacity: 1, x: 0 }}
                          className="flex items-center justify-between text-sm"
                        >
                          <span className="text-slate-300">
                            <span className="text-slate-500">{s.section}</span> {s.rowNumber}
                            {s.seatNumber}
                          </span>
                          <span className="font-medium">{inr(s.price)}</span>
                        </motion.li>
                      ))}
                    </ul>

                    <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-4">
                      <span className="text-sm text-slate-400">Total</span>
                      <span className="font-display text-2xl font-bold text-gradient">{inr(total)}</span>
                    </div>

                    <label className="mt-5 block text-xs font-semibold uppercase tracking-wider text-slate-400">
                      Payment method
                    </label>
                    <select
                      value={paymentMethod}
                      onChange={(e) => setPaymentMethod(e.target.value as typeof paymentMethod)}
                      className="field mt-1.5"
                    >
                      <option value="UPI">UPI</option>
                      <option value="CREDIT_CARD">Credit card</option>
                      <option value="DEBIT_CARD">Debit card</option>
                      <option value="NET_BANKING">Net banking</option>
                    </select>

                    <button onClick={confirmBooking} disabled={booking} className="btn-neon mt-4 w-full">
                      {booking ? 'Locking seats…' : user ? `Confirm ${selectedSeats.length} seat(s)` : 'Log in to book'}
                    </button>

                    {bookErr && (
                      <motion.p
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300"
                      >
                        {bookErr}
                      </motion.p>
                    )}

                    <p className="mt-3 text-[0.68rem] leading-relaxed text-slate-500">
                      Your seats are held in the database with{' '}
                      <code className="text-neon-violet">status = &apos;HELD&apos;</code> until the timer runs out.
                      Booking then locks the rows with{' '}
                      <code className="text-neon-violet">SELECT … FOR UPDATE</code> inside a transaction, so two people
                      can never buy the same seat.
                    </p>
                  </>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </aside>
      </div>
    </div>
  );
}

/** Live countdown on the caller's seat hold. */
function HoldCountdown({ until, onExpire }: { until: string; onExpire: () => void }) {
  const [left, setLeft] = useState(() => new Date(until).getTime() - Date.now());

  useEffect(() => {
    setLeft(new Date(until).getTime() - Date.now());
    const t = setInterval(() => {
      const ms = new Date(until).getTime() - Date.now();
      setLeft(ms);
      if (ms <= 0) onExpire();
    }, 1000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [until]);

  if (left <= 0) {
    return (
      <p className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
        Your hold expired — those seats are back in the pool.
      </p>
    );
  }

  const mins = Math.floor(left / 60000);
  const secs = Math.floor((left % 60000) / 1000);
  const urgent = left < 60000;

  return (
    <div
      className={`mt-3 rounded-lg border px-3 py-2 text-xs ${
        urgent
          ? 'border-neon-pink/40 bg-neon-pink/10 text-neon-pink'
          : 'border-neon-amber/30 bg-neon-amber/10 text-neon-amber'
      }`}
    >
      Held for you —{' '}
      <span className="font-mono font-semibold">
        {mins}:{String(secs).padStart(2, '0')}
      </span>{' '}
      remaining
    </div>
  );
}
