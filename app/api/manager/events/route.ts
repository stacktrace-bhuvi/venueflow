import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireRole, successResponse, errorResponse } from '@/lib/auth/middleware';
import { getClient, query } from '@/lib/db/pg';

const createEventSchema = z.object({
  title: z.string().min(3),
  description: z.string().min(10),
  artist: z.string().min(2),
  genre: z.string().min(2),
  durationMinutes: z.number().int().positive(),
  posterUrl: z.string().url().optional(),
  venueId: z.number().int().positive(),
  shows: z
    .array(
      z.object({
        startTime: z.string(),
        endTime: z.string(),
        basePrice: z.number().positive(),
        pricingRules: z
          .object({
            minPrice: z.number().positive(),
            maxPrice: z.number().positive(),
            demandFactorWeight: z.number().min(0).default(0.35),
            viewWeight: z.number().min(0).default(0.05),
            abandonWeight: z.number().min(0).default(0.08),
          })
          .optional(),
      })
    )
    .min(1, 'At least 1 show schedule must be defined'),
});

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const auth = requireRole(req, ['manager', 'admin']);
  if ('errorResponse' in auth) {
    return auth.errorResponse;
  }

  const { user } = auth;

  try {
    const body = await req.json();
    const parseResult = createEventSchema.safeParse(body);

    if (!parseResult.success) {
      return errorResponse('Validation failed', 'VALIDATION_ERROR', 400, parseResult.error.errors);
    }

    const data = parseResult.data;

    // Verify manager ownership of the venue (unless platform admin)
    if (user.role === 'manager') {
      const venueCheck = await query('SELECT manager_id FROM venues WHERE id = $1', [data.venueId]);
      if (venueCheck.rows.length === 0) {
        return errorResponse('Venue not found', 'NOT_FOUND', 404);
      }
      if (venueCheck.rows[0].manager_id !== user.userId) {
        return errorResponse('Forbidden. You do not manage this venue.', 'FORBIDDEN', 403);
      }
    }

    const client = await getClient();

    try {
      await client.query('BEGIN');

      // 1. Insert Event
      const eventRes = await client.query(
        `INSERT INTO events (manager_id, title, description, artist, genre, duration_minutes, poster_url)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, created_at`,
        [
          user.userId,
          data.title,
          data.description,
          data.artist,
          data.genre,
          data.durationMinutes,
          data.posterUrl || null,
        ]
      );

      const eventId = eventRes.rows[0].id;
      const createdShows: any[] = [];

      // 2. Insert Shows and Pricing Rules
      for (const showInput of data.shows) {
        const showRes = await client.query(
          `INSERT INTO shows (event_id, venue_id, start_time, end_time, base_price, status)
           VALUES ($1, $2, $3, $4, $5, 'SCHEDULED')
           RETURNING id`,
          [eventId, data.venueId, showInput.startTime, showInput.endTime, showInput.basePrice]
        );

        const showId = showRes.rows[0].id;

        // Pricing Rules
        const rules = showInput.pricingRules || {
          minPrice: showInput.basePrice * 0.8,
          maxPrice: showInput.basePrice * 2.2,
          demandFactorWeight: 0.35,
          viewWeight: 0.05,
          abandonWeight: 0.08,
        };

        await client.query(
          `INSERT INTO pricing_rules (show_id, min_price, max_price, demand_factor_weight, view_weight, abandon_weight)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            showId,
            rules.minPrice,
            rules.maxPrice,
            rules.demandFactorWeight,
            rules.viewWeight,
            rules.abandonWeight,
          ]
        );

        // 3. Instantiate show_seats from all seats at this venue
        await client.query(
          `INSERT INTO show_seats (show_id, seat_id, status)
           SELECT $1, s.id, 'AVAILABLE'
           FROM seats s
           JOIN venue_sections vs ON s.venue_section_id = vs.id
           WHERE vs.venue_id = $2`,
          [showId, data.venueId]
        );

        createdShows.push({
          showId,
          startTime: showInput.startTime,
          endTime: showInput.endTime,
          basePrice: showInput.basePrice,
        });
      }

      await client.query('COMMIT');

      return successResponse(
        {
          eventId,
          title: data.title,
          shows: createdShows,
        },
        'Event and scheduled shows created successfully',
        201
      );
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err: any) {
    console.error('[Create Event Error]:', err);
    return errorResponse(err.message || 'Error creating event', 'INTERNAL_SERVER_ERROR', 500);
  }
}
