import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireRole, successResponse, errorResponse } from '@/lib/auth/middleware';
import { getClient, query } from '@/lib/db/pg';

const createSectionSchema = z.object({
  name: z.enum(['VIP', 'PREMIUM', 'GENERAL', 'BALCONY']),
  baseMultiplier: z.number().min(1.0).default(1.0),
  capacity: z.number().int().positive(),
  rows: z.array(z.string().min(1)).min(1),
  seatsPerRow: z.number().int().positive(),
});

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = requireRole(req, ['manager', 'admin']);
  if ('errorResponse' in auth) {
    return auth.errorResponse;
  }

  const { user } = auth;
  const venueId = parseInt(params.id, 10);

  if (isNaN(venueId)) {
    return errorResponse('Invalid venue ID', 'BAD_REQUEST', 400);
  }

  try {
    const venueCheck = await query('SELECT manager_id FROM venues WHERE id = $1', [venueId]);
    if (venueCheck.rows.length === 0) {
      return errorResponse('Venue not found', 'NOT_FOUND', 404);
    }

    if (user.role === 'manager' && venueCheck.rows[0].manager_id !== user.userId) {
      return errorResponse('Forbidden. You do not manage this venue.', 'FORBIDDEN', 403);
    }

    const body = await req.json();
    const parseResult = createSectionSchema.safeParse(body);

    if (!parseResult.success) {
      return errorResponse('Validation failed', 'VALIDATION_ERROR', 400, parseResult.error.errors);
    }

    const data = parseResult.data;
    const client = await getClient();

    try {
      await client.query('BEGIN');

      // 1. Create venue section
      const secRes = await client.query(
        `INSERT INTO venue_sections (venue_id, name, base_multiplier, capacity)
         VALUES ($1, $2, $3, $4)
         RETURNING id, name, base_multiplier, capacity`,
        [venueId, data.name, data.baseMultiplier, data.capacity]
      );

      const section = secRes.rows[0];
      let seatsCreated = 0;

      // 2. Generate individual seats
      for (const row of data.rows) {
        for (let seatNum = 1; seatNum <= data.seatsPerRow; seatNum++) {
          await client.query(
            `INSERT INTO seats (venue_section_id, row_label, seat_number, is_accessible)
             VALUES ($1, $2, $3, $4)`,
            [section.id, row, seatNum, seatNum === 1]
          );
          seatsCreated++;
        }
      }

      await client.query('COMMIT');

      return successResponse(
        {
          sectionId: section.id,
          name: section.name,
          baseMultiplier: parseFloat(section.base_multiplier),
          capacity: section.capacity,
          seatsCreated,
        },
        `Created section ${section.name} with ${seatsCreated} physical seats`,
        201
      );
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err: any) {
    console.error('[Create Section Error]:', err);
    if (err.code === '23505') {
      return errorResponse('A section with this name already exists in this venue.', 'DUPLICATE_SECTION', 409);
    }
    return errorResponse(err.message || 'Error creating section layout', 'INTERNAL_SERVER_ERROR', 500);
  }
}
