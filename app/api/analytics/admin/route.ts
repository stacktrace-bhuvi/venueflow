import { NextRequest } from 'next/server';
import { requireRole, successResponse, errorResponse } from '@/lib/auth/middleware';
import { query } from '@/lib/db/pg';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = requireRole(req, ['admin']);
  if ('errorResponse' in auth) {
    return auth.errorResponse;
  }

  try {
    // 1. Revenue by Event View
    const revenueRes = await query('SELECT * FROM revenue_by_event_view ORDER BY gross_revenue DESC');

    // 2. User Breakdown by Role
    const usersRes = await query(`
      SELECT role, COUNT(*) as count 
      FROM users 
      GROUP BY role
    `);

    // 3. Platform Financial Overview
    const platformRes = await query(`
      SELECT 
        COUNT(b.id) as total_bookings,
        COALESCE(SUM(b.total_amount) FILTER (WHERE b.status = 'CONFIRMED'), 0.00) as total_confirmed_volume,
        COALESCE(SUM(b.total_amount) FILTER (WHERE b.status = 'CANCELLED'), 0.00) as total_refunded_volume
      FROM bookings b
    `);

    // 4. Recent Audit Log Activity
    const auditRes = await query(`
      SELECT id, table_name, record_id, action, changed_by, created_at
      FROM audit_log
      ORDER BY created_at DESC
      LIMIT 10
    `);

    return successResponse({
      platformSummary: {
        totalBookings: parseInt(platformRes.rows[0]?.total_bookings || '0', 10),
        totalGrossVolume: parseFloat(platformRes.rows[0]?.total_confirmed_volume || '0.00'),
        totalRefundedVolume: parseFloat(platformRes.rows[0]?.total_refunded_volume || '0.00'),
        netSettledVolume:
          parseFloat(platformRes.rows[0]?.total_confirmed_volume || '0.00') -
          parseFloat(platformRes.rows[0]?.total_refunded_volume || '0.00'),
      },
      userDemographics: usersRes.rows.map((r) => ({
        role: r.role,
        count: parseInt(r.count, 10),
      })),
      revenueByEvent: revenueRes.rows.map((r) => ({
        eventId: r.event_id,
        eventTitle: r.event_title,
        artist: r.artist,
        genre: r.genre,
        organizerName: r.organizer_name,
        showsScheduled: parseInt(r.total_shows_scheduled || '0', 10),
        ticketsSold: parseInt(r.tickets_sold_count || '0', 10),
        grossRevenue: parseFloat(r.gross_revenue || '0.00'),
        refundedRevenue: parseFloat(r.refunded_revenue || '0.00'),
        netRevenue: parseFloat(r.net_revenue || '0.00'),
      })),
      recentAuditTrail: auditRes.rows.map((r) => ({
        id: r.id,
        tableName: r.table_name,
        recordId: r.record_id,
        action: r.action,
        timestamp: r.created_at,
      })),
    });
  } catch (err: any) {
    console.error('[Admin Analytics Error]:', err);
    return errorResponse(err.message || 'Error fetching admin platform analytics', 'INTERNAL_SERVER_ERROR', 500);
  }
}
