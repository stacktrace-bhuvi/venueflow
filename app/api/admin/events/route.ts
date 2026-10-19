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
    const sql = `
      SELECT 
        e.id, e.title, e.artist, e.genre, e.duration_minutes, e.is_active, e.created_at,
        u.id as organizer_id, u.full_name as organizer_name, u.email as organizer_email,
        COUNT(DISTINCT s.id) as scheduled_shows,
        COUNT(DISTINCT b.id) FILTER (WHERE b.status = 'CONFIRMED') as confirmed_bookings
      FROM events e
      JOIN users u ON e.manager_id = u.id
      LEFT JOIN shows s ON e.id = s.event_id
      LEFT JOIN bookings b ON s.id = b.show_id
      GROUP BY e.id, u.id, u.full_name, u.email
      ORDER BY e.created_at DESC
    `;

    const res = await query(sql);

    return successResponse({
      events: res.rows.map((r) => ({
        id: r.id,
        title: r.title,
        artist: r.artist,
        genre: r.genre,
        durationMinutes: r.duration_minutes,
        isActive: r.is_active,
        createdAt: r.created_at,
        organizer: {
          id: r.organizer_id,
          name: r.organizer_name,
          email: r.organizer_email,
        },
        stats: {
          scheduledShows: parseInt(r.scheduled_shows || '0', 10),
          confirmedBookings: parseInt(r.confirmed_bookings || '0', 10),
        },
      })),
    });
  } catch (err: any) {
    console.error('[Admin Events Error]:', err);
    return errorResponse(err.message || 'Error fetching events', 'INTERNAL_SERVER_ERROR', 500);
  }
}
