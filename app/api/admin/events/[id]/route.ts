import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireRole, successResponse, errorResponse } from '@/lib/auth/middleware';
import { query } from '@/lib/db/pg';

const updateEventStatusSchema = z.object({
  isActive: z.boolean(),
});

export const dynamic = 'force-dynamic';

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = requireRole(req, ['admin']);
  if ('errorResponse' in auth) {
    return auth.errorResponse;
  }

  const eventId = parseInt(params.id, 10);
  if (isNaN(eventId)) {
    return errorResponse('Invalid event ID', 'BAD_REQUEST', 400);
  }

  try {
    const body = await req.json();
    const parseResult = updateEventStatusSchema.safeParse(body);

    if (!parseResult.success) {
      return errorResponse('Validation failed', 'VALIDATION_ERROR', 400, parseResult.error.errors);
    }

    const { isActive } = parseResult.data;

    const res = await query(
      `UPDATE events
       SET is_active = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING id, title, is_active, updated_at`,
      [isActive, eventId]
    );

    if (res.rows.length === 0) {
      return errorResponse('Event not found', 'NOT_FOUND', 404);
    }

    return successResponse(res.rows[0], `Event status updated to ${isActive ? 'active' : 'inactive'}`);
  } catch (err: any) {
    console.error('[Admin Update Event Error]:', err);
    return errorResponse(err.message || 'Error updating event status', 'INTERNAL_SERVER_ERROR', 500);
  }
}
