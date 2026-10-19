import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireRole, successResponse, errorResponse } from '@/lib/auth/middleware';
import { getClient, query } from '@/lib/db/pg';

const createShowSchema = z.object({
  eventId: z.number().int().positive(),
  venueId: z.number().int().positive(),
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
    const parseResult = createShowSchema.safeParse(body);

    if (!parseResult.success) {
      return errorResponse('Validation failed', 'VALIDATION_ERROR', 400, parseResult.error.errors);
    }

    const data = parseResult.data;

    // Validate venue ownership if role is manager
    if (user.role === 'manager') {
      const vCheck = await query('SELECT manager_id FROM venues WHERE id = $1', [data.venueId]);
      if (vCheck.rows.length === 0) {
        return errorResponse('Venue not found', 'NOT_FOUND', 404);
      }
      if (vCheck.rows[0].manager_id !== user.userId) {
        return errorResponse('Forbidden. You do not manage this venue.', 'FORBIDDEN', 403);
      }
    }

    // Check event exists
    const eCheck = await query('SELECT id, title FROM events WHERE id = $1', [data.eventId]);
    if (eCheck.rows.length === 0) {
      return errorResponse('Event not found', 'NOT_FOUND', 404);
    }

    const client = await getClient();

    try {
      await client.query('BEGIN');

      // 1. Insert Show
      const showRes = await client.query(
        `INSERT INTO shows (event_id, venue_id, start_time, end_time, base_price, status)
         VALUES ($1, $2, $3, $4, $5, 'SCHEDULED')
         RETURNING id, start_time, end_time, base_price, status, created_at`,
        [data.eventId, data.venueId, data.startTime, data.endTime, data.basePrice]
      );

      const show = showRes.rows[0];

      // 2. Insert Pricing Rules
      const rules = data.pricingRules || {
        minPrice: data.basePrice * 0.8,
        maxPrice: data.basePrice * 2.2,
        demandFactorWeight: 0.35,
        viewWeight: 0.05,
        abandonWeight: 0.08,
      };

      await client.query(
        `INSERT INTO pricing_rules (show_id, min_price, max_price, demand_factor_weight, view_weight, abandon_weight)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          show.id,
          rules.minPrice,
          rules.maxPrice,
          rules.demandFactorWeight,
          rules.viewWeight,
          rules.abandonWeight,
        ]
      );

      // 3. Instantiate show_seats from all physical seats in this venue
      const seatsRes = await client.query(
        `INSERT INTO show_seats (show_id, seat_id, status)
         SELECT $1, s.id, 'AVAILABLE'
         FROM seats s
         JOIN venue_sections vs ON s.venue_section_id = vs.id
         WHERE vs.venue_id = $2
         RETURNING id`,
        [show.id, data.venueId]
      );

      await client.query('COMMIT');

      return successResponse(
        {
          show: {
            id: show.id,
            eventId: data.eventId,
            eventTitle: eCheck.rows[0].title,
            venueId: data.venueId,
            startTime: show.start_time,
            endTime: show.end_time,
            basePrice: parseFloat(show.base_price),
            seatsInstantiated: seatsRes.rowCount,
          },
        },
        'Show scheduled and seat inventory instantiated successfully',
        201
      );
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err: any) {
    console.error('[Create Show Error]:', err);
    return errorResponse(err.message || 'Error scheduling show', 'INTERNAL_SERVER_ERROR', 500);
  }
}
