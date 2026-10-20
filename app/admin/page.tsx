'use client';

import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { apiFetch, inr } from '@/lib/api';
import Protected from '@/components/Protected';

type Analytics = {
  platformSummary: {
    totalBookings: number;
    totalGrossVolume: number;
    totalRefundedVolume: number;
    netSettledVolume: number;
  };
  userDemographics: { role: string; count: number }[];
  revenueByEvent: {
    eventId: number;
    eventTitle: string;
    artist: string | null;
    genre: string | null;
    organizerName: string;
    showsScheduled: number;
    ticketsSold: number;
    grossRevenue: number;
    refundedRevenue: number;
    netRevenue: number;
  }[];
  recentAuditTrail: { id: number; tableName: string; recordId: number; action: string; timestamp: string }[];
};

type AdminUser = {
  id: number;
  email: string;
  fullName: string;
  role: string;
  createdAt: string;
  totalBookings: number;
  totalSpent: number;
};

/* Fixed categorical order — never cycled, never reassigned by rank.
   Validated for CVD separation against the dark surface. */
const ROLE_COLOR: Record<string, string> = {
  customer: 'var(--color-chart-1)',
  manager: 'var(--color-chart-2)',
  admin: 'var(--color-chart-3)',
};

function AdminInner() {
  const [data, setData] = useState<Analytics | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'overview' | 'users'>('overview');

  useEffect(() => {
    Promise.all([
      apiFetch<Analytics>('/analytics/admin'),
      apiFetch<{ users: AdminUser[] }>('/admin/users').catch(() => ({ users: [] })),
    ])
      .then(([a, u]) => {
        setData(a);
        setUsers(u.users);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="h-96 rounded-3xl shimmer" />;
  if (error || !data) {
    return <div className="glass rounded-2xl border-red-500/30 p-6 text-sm text-red-300">{error}</div>;
  }

  const totalUsers = data.userDemographics.reduce((s, d) => s + d.count, 0);
  const maxRevenue = Math.max(1, ...data.revenueByEvent.map((e) => e.netRevenue));

  return (
    <div className="space-y-9">
      <div>
        <h1 className="font-display text-4xl font-bold">
          Admin <span className="text-gradient">console</span>
        </h1>
        <p className="mt-1.5 text-sm text-slate-400">
          Platform-wide figures from <code className="text-neon-violet">revenue_by_event_view</code> and the{' '}
          <code className="text-neon-violet">audit_log</code> table.
        </p>
      </div>

      {/* tabs */}
      <div className="flex gap-1 border-b border-white/8">
        {(['overview', 'users'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`relative px-4 py-2.5 text-sm font-semibold capitalize transition ${
              tab === t ? 'text-white' : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            {t}
            {tab === t && (
              <motion.span layoutId="admin-tab" className="absolute inset-x-0 -bottom-px h-0.5 bg-neon-violet" />
            )}
          </button>
        ))}
      </div>

      {tab === 'overview' ? (
        <>
          {/* KPI row */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: 'Total bookings', value: String(data.platformSummary.totalBookings) },
              { label: 'Gross volume', value: inr(data.platformSummary.totalGrossVolume) },
              { label: 'Refunded', value: inr(data.platformSummary.totalRefundedVolume) },
              { label: 'Net settled', value: inr(data.platformSummary.netSettledVolume) },
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

          <div className="grid gap-5 lg:grid-cols-[18rem_1fr]">
            {/* role mix — categorical, legend + direct labels (never colour alone) */}
            <div className="glass rounded-2xl p-6">
              <h2 className="font-display text-base font-bold">Users by role</h2>
              <p className="mt-0.5 text-xs text-slate-500">{totalUsers} accounts</p>

              <ul className="mt-5 space-y-3.5">
                {data.userDemographics.map((d) => {
                  const pct = totalUsers ? (d.count / totalUsers) * 100 : 0;
                  return (
                    <li key={d.role}>
                      <div className="mb-1.5 flex items-center justify-between text-xs">
                        <span className="flex items-center gap-2 capitalize text-slate-300">
                          <span
                            aria-hidden
                            className="h-2.5 w-2.5 rounded-sm"
                            style={{ background: ROLE_COLOR[d.role] ?? 'var(--color-chart-1)' }}
                          />
                          {d.role}
                        </span>
                        <span className="font-semibold text-slate-300">
                          {d.count} <span className="text-slate-500">({pct.toFixed(0)}%)</span>
                        </span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-white/8">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${pct}%` }}
                          transition={{ duration: 0.7 }}
                          className="h-full rounded-full"
                          style={{ background: ROLE_COLOR[d.role] ?? 'var(--color-chart-1)' }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>

            {/* revenue by event — sequential single hue, direct labels */}
            <div className="glass rounded-2xl p-6">
              <h2 className="font-display text-base font-bold">Net revenue by event</h2>
              <p className="mt-0.5 text-xs text-slate-500">Gross less refunds, per event.</p>

              {data.revenueByEvent.length === 0 ? (
                <p className="mt-6 text-sm text-slate-400">No revenue recorded yet.</p>
              ) : (
                <ul className="mt-5 space-y-4">
                  {data.revenueByEvent.map((e) => (
                    <li key={e.eventId} title={`${e.ticketsSold} tickets · gross ${inr(e.grossRevenue)}`}>
                      <div className="mb-1.5 flex items-baseline justify-between gap-4 text-xs">
                        <span className="truncate text-slate-300">{e.eventTitle}</span>
                        <span className="shrink-0 font-semibold">{inr(e.netRevenue)}</span>
                      </div>
                      <div className="h-2.5 w-full overflow-hidden rounded-full bg-white/8">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${(e.netRevenue / maxRevenue) * 100}%` }}
                          transition={{ duration: 0.7 }}
                          className="h-full rounded-full bg-chart-1"
                        />
                      </div>
                      <p className="mt-1 text-[0.65rem] text-slate-500">
                        {e.ticketsSold} tickets · {e.showsScheduled} shows · {e.organizerName}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* audit trail */}
          <section>
            <h2 className="font-display text-xl font-bold">Recent audit trail</h2>
            <p className="mt-1 text-sm text-slate-400">
              Written automatically by triggers on every tracked state change.
            </p>
            <div className="glass mt-4 overflow-x-auto rounded-2xl">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-white/8 text-[0.65rem] uppercase tracking-wider text-slate-500">
                    <th className="px-5 py-3 font-semibold">Table</th>
                    <th className="px-5 py-3 font-semibold">Record</th>
                    <th className="px-5 py-3 font-semibold">Action</th>
                    <th className="px-5 py-3 font-semibold">When</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recentAuditTrail.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-5 py-8 text-center text-slate-400">
                        No audit records yet — book or cancel something to see triggers fire.
                      </td>
                    </tr>
                  )}
                  {data.recentAuditTrail.map((a) => (
                    <tr key={a.id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.03]">
                      <td className="px-5 py-3 font-mono text-xs text-slate-300">{a.tableName}</td>
                      <td className="px-5 py-3 text-slate-400">#{a.recordId}</td>
                      <td className="px-5 py-3">
                        <span className="pill bg-white/5 text-slate-300">{a.action}</span>
                      </td>
                      <td className="px-5 py-3 text-slate-400">{new Date(a.timestamp).toLocaleString('en-IN')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : (
        /* users tab */
        <div className="glass overflow-x-auto rounded-2xl">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-white/8 text-[0.65rem] uppercase tracking-wider text-slate-500">
                <th className="px-5 py-3 font-semibold">User</th>
                <th className="px-5 py-3 font-semibold">Role</th>
                <th className="px-5 py-3 font-semibold">Bookings</th>
                <th className="px-5 py-3 font-semibold">Total spent</th>
                <th className="px-5 py-3 font-semibold">Joined</th>
              </tr>
            </thead>
            <tbody>
              {users.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-slate-400">
                    No users returned.
                  </td>
                </tr>
              )}
              {users.map((u) => (
                <tr key={u.id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.03]">
                  <td className="px-5 py-3.5">
                    <p className="font-semibold">{u.fullName}</p>
                    <p className="text-xs text-slate-500">{u.email}</p>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="inline-flex items-center gap-1.5 text-xs capitalize text-slate-300">
                      <span
                        aria-hidden
                        className="h-2.5 w-2.5 rounded-sm"
                        style={{ background: ROLE_COLOR[u.role] ?? 'var(--color-chart-1)' }}
                      />
                      {u.role}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-slate-300">{u.totalBookings}</td>
                  <td className="px-5 py-3.5 text-slate-300">{inr(u.totalSpent)}</td>
                  <td className="px-5 py-3.5 text-slate-400">{new Date(u.createdAt).toLocaleDateString('en-IN')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function AdminPage() {
  return (
    <Protected roles={['admin']}>
      <AdminInner />
    </Protected>
  );
}
