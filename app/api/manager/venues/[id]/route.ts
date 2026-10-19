import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireRole, successResponse, errorResponse } from '@/lib/auth/middleware';
import { query } from '@/lib/db/pg';

const updateVenueSchema = z.object({
  name: z.string().min(2).optional(),
  address: z.string().min(5).optional(),
  city: z.string().min(2).optional(),
  state: z.string().min(2).optional(),
  postalCode: z.string().min(4).optional(),
  totalCapacity: z.number().int().positive().optional(),
});

export const dynamic = 'force-dynamic';

export async function PATCH(
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
    const parseResult = updateVenueSchema.safeParse(body);

    if (!parseResult.success) {
      return errorResponse('Validation failed', 'VALIDATION_ERROR', 400, parseResult.error.errors);
    }

    const updates = parseResult.data;
    const updateFields: string[] = ['updated_at = NOW()'];
    const values: any[] = [venueId];
    let pIdx = 2;

    if (updates.name !== undefined) {
      updateFields.push(`name = $${pIdx}`);
      values.push(updates.name);
      pIdx++;
    }
    if (updates.address !== undefined) {
      updateFields.push(`address = $${pIdx}`);
      values.push(updates.address);
      pIdx++;
    }
    if (updates.city !== undefined) {
      updateFields.push(`city = $${pIdx}`);
      values.push(updates.city);
      pIdx++;
    }
    if (updates.state !== undefined) {
      updateFields.push(`state = $${pIdx}`);
      values.push(updates.state);
      pIdx++;
    }
    if (updates.postalCode !== undefined) {
      updateFields.push(`postal_code = $${pIdx}`);
      values.push(updates.postalCode);
      pIdx++;
    }
    if (updates.totalCapacity !== undefined) {
      updateFields.push(`total_capacity = $${pIdx}`);
      values.push(updates.totalCapacity);
      pIdx++;
    }

    const sql = `
      UPDATE venues
      SET ${updateFields.join(', ')}
      WHERE id = $1
      RETURNING *
    `;

    const res = await query(sql, values);
    return successResponse(res.rows[0], 'Venue updated successfully');
  } catch (err: any) {
    console.error('[Update Venue Error]:', err);
    return errorResponse(err.message || 'Error updating venue', 'INTERNAL_SERVER_ERROR', 500);
  }
}
