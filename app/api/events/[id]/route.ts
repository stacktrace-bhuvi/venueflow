import { NextRequest } from 'next/server';
import { query } from '@/lib/db/pg';
import { successResponse, errorResponse } from '@/lib/auth/middleware';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const eventId = parseInt(params.id, 10);
    if (isNaN(eventId)) {
      return errorResponse('Invalid event ID parameter', 'BAD_REQUEST', 400);
    }

    const eventRes = await query(
      `SELECT 
         e.id, e.title, e.description, e.artist, e.genre, 
         e.duration_minutes, e.poster_url, e.is_active, e.created_at,
         u.full_name as organizer_name, u.email as organizer_email
       FROM events e
       JOIN users u ON e.manager_id = u.id
       WHERE e.id = $1`,
      [eventId]
    );

    if (eventRes.rows.length === 0) {
      return errorResponse('Event not found', 'NOT_FOUND', 404);
    }

    const event = eventRes.rows[0];

    // Fetch all scheduled shows for this event
    const showsRes = await query(
      `SELECT 
         s.id, s.start_time, s.end_time, s.base_price, s.status,
         v.id as venue_id, v.name as venue_name, v.address as venue_address,
         v.city as venue_city, v.state as venue_state, v.total_capacity,
         pr.min_price, pr.max_price,
         (
           SELECT COUNT(*) FROM show_seats ss 
           WHERE ss.show_id = s.id AND ss.status = 'AVAILABLE'
         ) as available_seats,
         (
           SELECT COUNT(*) FROM show_seats ss 
           WHERE ss.show_id = s.id
         ) as total_seats
       FROM shows s
       JOIN venues v ON s.venue_id = v.id
       LEFT JOIN pricing_rules pr ON s.id = pr.show_id
       WHERE s.event_id = $1
       ORDER BY s.start_time ASC`,
      [eventId]
    );

    return successResponse({
      event: {
        id: event.id,
        title: event.title,
        description: event.description,
        artist: event.artist,
        genre: event.genre,
        durationMinutes: event.duration_minutes,
        posterUrl: event.poster_url,
        isActive: event.is_active,
        organizer: {
          name: event.organizer_name,
          email: event.organizer_email,
        },
        shows: showsRes.rows.map((s) => ({
          id: s.id,
          startTime: s.start_time,
          endTime: s.end_time,
          basePrice: parseFloat(s.base_price),
          minPrice: s.min_price ? parseFloat(s.min_price) : null,
          maxPrice: s.max_price ? parseFloat(s.max_price) : null,
          status: s.status,
          availableSeats: parseInt(s.available_seats || '0', 10),
          totalSeats: parseInt(s.total_seats || '0', 10),
          venue: {
            id: s.venue_id,
            name: s.venue_name,
            address: s.venue_address,
            city: s.venue_city,
            state: s.venue_state,
            totalCapacity: s.total_capacity,
          },
        })),
      },
    });
  } catch (err: any) {
    console.error('[Event Detail Error]:', err);
    return errorResponse(err.message || 'Error fetching event details', 'INTERNAL_SERVER_ERROR', 500);
  }
}
