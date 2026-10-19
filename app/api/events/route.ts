import { NextRequest } from 'next/server';
import { query } from '@/lib/db/pg';
import { successResponse, errorResponse } from '@/lib/auth/middleware';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    const q = searchParams.get('q')?.trim() || '';
    const genre = searchParams.get('genre')?.trim() || '';
    const city = searchParams.get('city')?.trim() || '';
    const venueId = searchParams.get('venueId') ? parseInt(searchParams.get('venueId')!, 10) : null;
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') || '10', 10)));
    const offset = (page - 1) * limit;

    const conditions: string[] = ['e.is_active = TRUE'];
    const values: any[] = [];
    let paramIndex = 1;

    // Advanced Concept: PostgreSQL Full-Text Search via GIN index on search_vector
    if (q) {
      conditions.push(`e.search_vector @@ plainto_tsquery('english', $${paramIndex})`);
      values.push(q);
      paramIndex++;
    }

    if (genre) {
      conditions.push(`LOWER(e.genre) = LOWER($${paramIndex})`);
      values.push(genre);
      paramIndex++;
    }

    if (city) {
      conditions.push(`EXISTS (
        SELECT 1 FROM shows s 
        JOIN venues v ON s.venue_id = v.id 
        WHERE s.event_id = e.id AND LOWER(v.city) = LOWER($${paramIndex})
      )`);
      values.push(city);
      paramIndex++;
    }

    if (venueId) {
      conditions.push(`EXISTS (
        SELECT 1 FROM shows s 
        WHERE s.event_id = e.id AND s.venue_id = $${paramIndex}
      )`);
      values.push(venueId);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Count total matches for pagination
    const countSql = `SELECT COUNT(*) as total FROM events e ${whereClause}`;
    const countRes = await query(countSql, values);
    const total = parseInt(countRes.rows[0]?.total || '0', 10);

    // Fetch paginated events with next show info
    const selectSql = `
      SELECT 
        e.id,
        e.title,
        e.description,
        e.artist,
        e.genre,
        e.duration_minutes,
        e.poster_url,
        e.created_at,
        (
          SELECT json_build_object(
            'id', s.id,
            'startTime', s.start_time,
            'endTime', s.end_time,
            'basePrice', s.base_price,
            'status', s.status,
            'venue', json_build_object('id', v.id, 'name', v.name, 'city', v.city)
          )
          FROM shows s
          JOIN venues v ON s.venue_id = v.id
          WHERE s.event_id = e.id AND s.start_time >= NOW()
          ORDER BY s.start_time ASC
          LIMIT 1
        ) as next_show
      FROM events e
      ${whereClause}
      ORDER BY e.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    values.push(limit, offset);

    const eventsRes = await query(selectSql, values);

    return successResponse({
      events: eventsRes.rows.map((row) => ({
        id: row.id,
        title: row.title,
        description: row.description,
        artist: row.artist,
        genre: row.genre,
        durationMinutes: row.duration_minutes,
        posterUrl: row.poster_url,
        createdAt: row.created_at,
        nextShow: row.next_show,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err: any) {
    console.error('[Events Discovery Error]:', err);
    return errorResponse(err.message || 'Error fetching events catalog', 'INTERNAL_SERVER_ERROR', 500);
  }
}
