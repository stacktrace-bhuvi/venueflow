import { NextRequest } from 'next/server';
import { requireAuth, successResponse, errorResponse } from '@/lib/auth/middleware';
import { query } from '@/lib/db/pg';
import { cascadeExpiredWaitlistPromotions } from '@/lib/services/waitlist';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if ('errorResponse' in auth) {
    return auth.errorResponse;
  }

  const { user } = auth;

  try {
    // 1. Fetch user's waitlist entries
    const res = await query(
      `SELECT 
         we.id,
         we.show_id,
         we.requested_quantity,
         we.position,
         we.status,
         we.promoted_until,
         we.created_at,
         s.start_time,
         e.title as event_title,
         v.name as venue_name,
         (
           SELECT COUNT(*) FROM waitlist_entries we2
           WHERE we2.show_id = we.show_id AND we2.status = 'WAITING' AND we2.position < we.position
         ) as people_ahead_in_queue
       FROM waitlist_entries we
       JOIN shows s ON we.show_id = s.id
       JOIN events e ON s.event_id = e.id
       JOIN venues v ON s.venue_id = v.id
       WHERE we.user_id = $1
       ORDER BY we.created_at DESC`,
      [user.userId]
    );

    // 2. Proactively trigger expiry check on any show the user is promoted for
    for (const r of res.rows) {
      if (r.status === 'PROMOTED' && new Date(r.promoted_until) < new Date()) {
        await cascadeExpiredWaitlistPromotions(r.show_id);
      }
    }

    return successResponse({
      entries: res.rows.map((r) => ({
        id: r.id,
        showId: r.show_id,
        eventTitle: r.event_title,
        venueName: r.venue_name,
        startTime: r.start_time,
        requestedQuantity: r.requested_quantity,
        position: r.position,
        peopleAheadInQueue: parseInt(r.people_ahead_in_queue || '0', 10),
        status: r.status,
        promotedUntil: r.promoted_until,
        createdAt: r.created_at,
      })),
    });
  } catch (err: any) {
    console.error('[Get Waitlist Error]:', err);
    return errorResponse(err.message || 'Error fetching waitlist records', 'INTERNAL_SERVER_ERROR', 500);
  }
}
