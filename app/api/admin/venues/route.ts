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
        v.id, v.name, v.address, v.city, v.state, v.postal_code, v.total_capacity, v.created_at,
        u.id as manager_id, u.full_name as manager_name, u.email as manager_email,
        COUNT(DISTINCT s.id) as scheduled_shows,
        COUNT(DISTINCT vs.id) as sections_count
      FROM venues v
      JOIN users u ON v.manager_id = u.id
      LEFT JOIN shows s ON v.id = s.venue_id
      LEFT JOIN venue_sections vs ON v.id = vs.venue_id
      GROUP BY v.id, u.id, u.full_name, u.email
      ORDER BY v.created_at DESC
    `;

    const res = await query(sql);

    return successResponse({
      venues: res.rows.map((r) => ({
        id: r.id,
        name: r.name,
        address: r.address,
        city: r.city,
        state: r.state,
        postalCode: r.postal_code,
        totalCapacity: r.total_capacity,
        createdAt: r.created_at,
        manager: {
          id: r.manager_id,
          name: r.manager_name,
          email: r.manager_email,
        },
        stats: {
          scheduledShows: parseInt(r.scheduled_shows || '0', 10),
          sectionsCount: parseInt(r.sections_count || '0', 10),
        },
      })),
    });
  } catch (err: any) {
    console.error('[Admin Venues Error]:', err);
    return errorResponse(err.message || 'Error fetching venues', 'INTERNAL_SERVER_ERROR', 500);
  }
}
