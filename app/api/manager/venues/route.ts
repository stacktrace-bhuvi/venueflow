import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireRole, successResponse, errorResponse } from '@/lib/auth/middleware';
import { getClient, query } from '@/lib/db/pg';

const createVenueSchema = z.object({
  name: z.string().min(2),
  address: z.string().min(5),
  city: z.string().min(2),
  state: z.string().min(2),
  postalCode: z.string().min(4),
  totalCapacity: z.number().int().positive(),
  sections: z
    .array(
      z.object({
        name: z.enum(['VIP', 'PREMIUM', 'GENERAL', 'BALCONY']),
        baseMultiplier: z.number().min(1.0).default(1.0),
        capacity: z.number().int().positive(),
        rows: z.array(z.string()).optional(),
        seatsPerRow: z.number().int().positive().optional(),
      })
    )
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
    const parseResult = createVenueSchema.safeParse(body);

    if (!parseResult.success) {
      return errorResponse('Validation failed', 'VALIDATION_ERROR', 400, parseResult.error.errors);
    }

    const data = parseResult.data;
    const client = await getClient();

    try {
      await client.query('BEGIN');

      // Insert Venue
      const venueRes = await client.query(
        `INSERT INTO venues (manager_id, name, address, city, state, postal_code, total_capacity)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, name, city, state, total_capacity, created_at`,
        [user.userId, data.name, data.address, data.city, data.state, data.postalCode, data.totalCapacity]
      );

      const venue = venueRes.rows[0];
      const createdSections: any[] = [];

      // Optional seat layout generation
      if (data.sections && data.sections.length > 0) {
        for (const sec of data.sections) {
          const secRes = await client.query(
            `INSERT INTO venue_sections (venue_id, name, base_multiplier, capacity)
             VALUES ($1, $2, $3, $4)
             RETURNING id, name, base_multiplier, capacity`,
            [venue.id, sec.name, sec.baseMultiplier, sec.capacity]
          );

          const section = secRes.rows[0];
          let createdSeatsCount = 0;

          if (sec.rows && sec.seatsPerRow) {
            for (const rowLabel of sec.rows) {
              for (let seatNum = 1; seatNum <= sec.seatsPerRow; seatNum++) {
                await client.query(
                  `INSERT INTO seats (venue_section_id, row_label, seat_number, is_accessible)
                   VALUES ($1, $2, $3, $4)`,
                  [section.id, rowLabel, seatNum, seatNum === 1]
                );
                createdSeatsCount++;
              }
            }
          }

          createdSections.push({
            id: section.id,
            name: section.name,
            baseMultiplier: parseFloat(section.base_multiplier),
            capacity: section.capacity,
            seatsGenerated: createdSeatsCount,
          });
        }
      }

      await client.query('COMMIT');

      return successResponse(
        {
          venue,
          sections: createdSections,
        },
        'Venue and seating layout created successfully',
        201
      );
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err: any) {
    console.error('[Create Venue Error]:', err);
    return errorResponse(err.message || 'Error creating venue', 'INTERNAL_SERVER_ERROR', 500);
  }
}

export async function GET(req: NextRequest) {
  const auth = requireRole(req, ['manager', 'admin']);
  if ('errorResponse' in auth) {
    return auth.errorResponse;
  }

  const { user } = auth;

  try {
    const isManager = user.role === 'manager';
    const sql = isManager
      ? 'SELECT * FROM venues WHERE manager_id = $1 ORDER BY created_at DESC'
      : 'SELECT * FROM venues ORDER BY created_at DESC';
    const params = isManager ? [user.userId] : [];

    const res = await query(sql, params);
    return successResponse({ venues: res.rows });
  } catch (err: any) {
    console.error('[Get Manager Venues Error]:', err);
    return errorResponse(err.message || 'Error fetching venues', 'INTERNAL_SERVER_ERROR', 500);
  }
}
