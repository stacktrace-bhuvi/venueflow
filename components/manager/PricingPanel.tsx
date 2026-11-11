'use client';

import { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { apiFetch, inr } from '@/lib/api';

type ShowRule = {
  showId: number;
  eventTitle: string;
  venueId: number;
  venueName: string;
  startTime: string;
  basePrice: number;
  status: string;
  pricingRuleId: number | null;
  minPrice: number | null;
  maxPrice: number | null;
  demandFactorWeight: number | null;
  viewWeight: number | null;
  searchWeight: number | null;
  abandonWeight: number | null;
};

type Draft = {
  minPrice: string;
  maxPrice: string;
  demandFactorWeight: string;
  viewWeight: string;
  searchWeight: string;
  abandonWeight: string;
};

const toDraft = (s: ShowRule): Draft => ({
  minPrice: s.minPrice?.toString() ?? '',
  maxPrice: s.maxPrice?.toString() ?? '',
  demandFactorWeight: s.demandFactorWeight?.toString() ?? '',
  viewWeight: s.viewWeight?.toString() ?? '',
  searchWeight: s.searchWeight?.toString() ?? '',
  abandonWeight: s.abandonWeight?.toString() ?? '',
});

export default function PricingPanel() {
  const [shows, setShows] = useState<ShowRule[]>([]);
  const [drafts, setDrafts] = useState<Record<number, Draft>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [savedId, setSavedId] = useState<number | null>(null);
  const [rowError, setRowError] = useState<Record<number, string>>({});

  const load = useCallback(async () => {
    try {
      const d = await apiFetch<{ shows: ShowRule[] }>('/manager/pricing-rules');
      setShows(d.shows);
      setDrafts(Object.fromEntries(d.shows.map((s) => [s.showId, toDraft(s)])));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const setField = (showId: number, field: keyof Draft, value: string) =>
    setDrafts((d) => ({ ...d, [showId]: { ...d[showId], [field]: value } }));

  async function save(show: ShowRule) {
    if (!show.pricingRuleId) return;
    const draft = drafts[show.showId];

    const min = Number(draft.minPrice);
    const max = Number(draft.maxPrice);
    if (max < min) {
      setRowError((e) => ({ ...e, [show.showId]: 'Ceiling cannot be below the floor.' }));
      return;
    }

    setSavingId(show.showId);
    setRowError((e) => ({ ...e, [show.showId]: '' }));
    try {
      await apiFetch(`/manager/pricing-rules/${show.pricingRuleId}`, {
        method: 'PATCH',
        body: {
          minPrice: min,
          maxPrice: max,
          demandFactorWeight: Number(draft.demandFactorWeight),
          viewWeight: Number(draft.viewWeight),
          searchWeight: Number(draft.searchWeight),
          abandonWeight: Number(draft.abandonWeight),
        },
      });
      setSavedId(show.showId);
      setTimeout(() => setSavedId(null), 2500);
      await load();
    } catch (e: any) {
      setRowError((err) => ({ ...err, [show.showId]: e.message }));
    } finally {
      setSavingId(null);
    }
  }

  if (loading) return <div className="h-64 rounded-3xl shimmer" />;
  if (error) return <div className="glass rounded-2xl border-red-500/30 p-5 text-sm text-red-300">{error}</div>;

  return (
    <div className="space-y-5">
      <div className="glass rounded-2xl p-5">
        <h2 className="font-display text-base font-bold">How these settings work</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-400">
          The live ticket price is computed by the{' '}
          <code className="text-neon-violet">calculate_dynamic_price</code> function as{' '}
          <span className="text-slate-300">base price × (1 + occupancy×demand weight + view and abandonment terms)</span>,
          then clamped between the floor and ceiling you set here. The floor and ceiling are the safety rails — however
          hot demand gets, the price can never leave that band.
        </p>
      </div>

      {shows.length === 0 && (
        <div className="glass rounded-2xl p-8 text-center text-sm text-slate-400">No shows at your venues yet.</div>
      )}

      {shows.map((show) => {
        const draft = drafts[show.showId];
        if (!draft) return null;
        const noRule = !show.pricingRuleId;

        return (
          <motion.div
            key={show.showId}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass rounded-2xl p-6"
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h3 className="font-display text-lg font-bold">{show.eventTitle}</h3>
                <p className="text-sm text-slate-400">
                  {show.venueName} ·{' '}
                  {new Date(show.startTime).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[0.65rem] uppercase tracking-wider text-slate-500">base price</p>
                <p className="font-display text-xl font-bold">{inr(show.basePrice)}</p>
              </div>
            </div>

            {noRule ? (
              <p className="mt-4 rounded-lg border border-neon-amber/30 bg-neon-amber/10 px-3 py-2 text-xs text-neon-amber">
                No pricing rule exists for this show, so defaults apply (floor = base × 0.8, ceiling = base × 2.5).
              </p>
            ) : (
              <>
                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  <Field
                    label="Price floor"
                    hint="Never sell below this"
                    value={draft.minPrice}
                    onChange={(v) => setField(show.showId, 'minPrice', v)}
                  />
                  <Field
                    label="Price ceiling"
                    hint="Never sell above this"
                    value={draft.maxPrice}
                    onChange={(v) => setField(show.showId, 'maxPrice', v)}
                  />
                </div>

                <p className="mt-5 text-[0.68rem] font-semibold uppercase tracking-wider text-slate-500">
                  Demand weights
                </p>
                <div className="mt-2 grid gap-4 sm:grid-cols-3">
                  <Field
                    label="Occupancy"
                    hint="How much fullness raises price"
                    step="0.01"
                    value={draft.demandFactorWeight}
                    onChange={(v) => setField(show.showId, 'demandFactorWeight', v)}
                  />
                  <Field
                    label="Page views"
                    hint="Weight of recent views"
                    step="0.01"
                    value={draft.viewWeight}
                    onChange={(v) => setField(show.showId, 'viewWeight', v)}
                  />
                  <Field
                    label="Abandonments"
                    hint="Weight of dropped checkouts"
                    step="0.01"
                    value={draft.abandonWeight}
                    onChange={(v) => setField(show.showId, 'abandonWeight', v)}
                  />
                </div>

                <div className="mt-5 flex flex-wrap items-center gap-3">
                  <button onClick={() => save(show)} disabled={savingId === show.showId} className="btn-neon">
                    {savingId === show.showId ? 'Saving…' : 'Save pricing rule'}
                  </button>
                  <button onClick={() => setDrafts((d) => ({ ...d, [show.showId]: toDraft(show) }))} className="btn-ghost">
                    Reset
                  </button>

                  <AnimatePresence>
                    {savedId === show.showId && (
                      <motion.span
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0 }}
                        className="text-sm font-semibold text-neon-emerald"
                      >
                        Saved — reload a seat map to see the new price
                      </motion.span>
                    )}
                  </AnimatePresence>
                </div>

                {rowError[show.showId] && (
                  <p className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                    {rowError[show.showId]}
                  </p>
                )}
              </>
            )}
          </motion.div>
        );
      })}
    </div>
  );
}

function Field({
  label,
  hint,
  value,
  onChange,
  step = '1',
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
  step?: string;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">{label}</label>
      <input type="number" step={step} min="0" value={value} onChange={(e) => onChange(e.target.value)} className="field" />
      <p className="mt-1 text-[0.65rem] text-slate-500">{hint}</p>
    </div>
  );
}
