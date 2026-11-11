'use client';

import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { apiFetch } from '@/lib/api';

type VenueOption = { venueId: number; venueName: string; city: string };

const SECTION_NAMES = ['VIP', 'PREMIUM', 'GENERAL', 'BALCONY'] as const;

/** A, B, C … Z, then AA, AB … */
function rowLabel(i: number): string {
  let s = '';
  let n = i;
  while (n >= 0) {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  }
  return s;
}

export default function SeatingPanel() {
  const [venues, setVenues] = useState<VenueOption[]>([]);
  const [loading, setLoading] = useState(true);

  const [venueId, setVenueId] = useState<number | ''>('');
  const [name, setName] = useState<(typeof SECTION_NAMES)[number]>('VIP');
  const [multiplier, setMultiplier] = useState('1.5');
  const [rowCount, setRowCount] = useState('2');
  const [seatsPerRow, setSeatsPerRow] = useState('10');
  const [startRow, setStartRow] = useState('A');

  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<{ venuesSummary: VenueOption[] }>('/analytics/manager')
      .then((d) => {
        setVenues(d.venuesSummary);
        if (d.venuesSummary.length === 1) setVenueId(d.venuesSummary[0].venueId);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const rows = useMemo(() => {
    const n = Math.max(0, Math.min(60, Number(rowCount) || 0));
    const offset = startRow.trim().toUpperCase().charCodeAt(0) - 65;
    const base = Number.isFinite(offset) && offset >= 0 ? offset : 0;
    return Array.from({ length: n }, (_, i) => rowLabel(base + i));
  }, [rowCount, startRow]);

  const capacity = rows.length * (Number(seatsPerRow) || 0);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!venueId) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await apiFetch<{ name: string; capacity: number; seatsCreated: number }>(
        `/manager/venues/${venueId}/sections`,
        {
          method: 'POST',
          body: {
            name,
            baseMultiplier: Number(multiplier),
            capacity,
            rows,
            seatsPerRow: Number(seatsPerRow),
          },
        }
      );
      setResult(`Created section ${res.name} with ${res.seatsCreated} physical seats.`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div className="h-64 rounded-3xl shimmer" />;

  return (
    <div className="space-y-5">
      <div className="glass rounded-2xl p-5">
        <h2 className="font-display text-base font-bold">Add a seating section</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-400">
          A section defines a tier of seating and how much more it costs. The price multiplier is applied on top of the
          live dynamic price — a VIP seat at 1.5× costs half again whatever the show is currently priced at. Creating a
          section generates every physical seat row by row, inside a single transaction.
        </p>
      </div>

      <form onSubmit={submit} className="glass rounded-2xl p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">Venue</label>
            <select
              required
              value={venueId}
              onChange={(e) => setVenueId(Number(e.target.value))}
              className="field"
            >
              <option value="">Select a venue…</option>
              {venues.map((v) => (
                <option key={v.venueId} value={v.venueId}>
                  {v.venueName} — {v.city}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">
              Section tier
            </label>
            <select value={name} onChange={(e) => setName(e.target.value as any)} className="field">
              {SECTION_NAMES.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            <p className="mt-1 text-[0.65rem] text-slate-500">
              Constrained by the <code className="text-neon-violet">seat_section</code> ENUM
            </p>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">
              Price multiplier
            </label>
            <input
              type="number"
              step="0.05"
              min="1"
              required
              value={multiplier}
              onChange={(e) => setMultiplier(e.target.value)}
              className="field"
            />
            <p className="mt-1 text-[0.65rem] text-slate-500">1.0 = standard · 1.5 = half again</p>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">
              First row label
            </label>
            <input
              maxLength={2}
              required
              value={startRow}
              onChange={(e) => setStartRow(e.target.value.toUpperCase())}
              className="field"
            />
            <p className="mt-1 text-[0.65rem] text-slate-500">Rows are lettered from here</p>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">
              Number of rows
            </label>
            <input
              type="number"
              min="1"
              max="60"
              required
              value={rowCount}
              onChange={(e) => setRowCount(e.target.value)}
              className="field"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">
              Seats per row
            </label>
            <input
              type="number"
              min="1"
              max="60"
              required
              value={seatsPerRow}
              onChange={(e) => setSeatsPerRow(e.target.value)}
              className="field"
            />
          </div>
        </div>

        {/* live preview */}
        <div className="mt-5 rounded-xl bg-white/5 px-4 py-3">
          <p className="text-xs text-slate-400">
            Will create <span className="font-semibold text-white">{capacity}</span> seats —{' '}
            {rows.length > 0 ? (
              <>
                rows <span className="text-neon-cyan">{rows[0]}</span> to{' '}
                <span className="text-neon-cyan">{rows[rows.length - 1]}</span>, {seatsPerRow} per row
              </>
            ) : (
              'nothing yet'
            )}
          </p>
        </div>

        <button type="submit" disabled={busy || !venueId || capacity < 1} className="btn-neon mt-5">
          {busy ? 'Creating seats…' : 'Create section'}
        </button>

        <AnimatePresence>
          {result && (
            <motion.p
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mt-4 rounded-lg border border-neon-emerald/30 bg-neon-emerald/10 px-3 py-2 text-sm text-neon-emerald"
            >
              {result}
            </motion.p>
          )}
          {error && (
            <motion.p
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300"
            >
              {error}
            </motion.p>
          )}
        </AnimatePresence>

        <p className="mt-4 text-[0.68rem] leading-relaxed text-slate-500">
          A venue can hold only one section per tier — a <code className="text-neon-violet">UNIQUE (venue_id, name)</code>{' '}
          constraint enforces it, so adding the same tier twice is refused by the database.
        </p>
        <p className="mt-2 text-[0.68rem] leading-relaxed text-slate-500">
          New seats are physical inventory. They are instantiated into a show&apos;s seat map (the{' '}
          <code className="text-neon-violet">show_seats</code> table) when a show is scheduled, so they appear on shows
          created after this section, not on existing ones.
        </p>
      </form>
    </div>
  );
}
