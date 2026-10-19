import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireRole, successResponse, errorResponse } from '@/lib/auth/middleware';
import { query } from '@/lib/db/pg';

const updateUserRoleSchema = z.object({
  role: z.enum(['customer', 'manager', 'admin']),
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

  const targetUserId = parseInt(params.id, 10);
  if (isNaN(targetUserId)) {
    return errorResponse('Invalid user ID', 'BAD_REQUEST', 400);
  }

  try {
    const body = await req.json();
    const parseResult = updateUserRoleSchema.safeParse(body);

    if (!parseResult.success) {
      return errorResponse('Validation failed', 'VALIDATION_ERROR', 400, parseResult.error.errors);
    }

    const { role } = parseResult.data;

    const res = await query(
      `UPDATE users
       SET role = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING id, email, full_name, role, updated_at`,
      [role, targetUserId]
    );

    if (res.rows.length === 0) {
      return errorResponse('User not found', 'NOT_FOUND', 404);
    }

    return successResponse(res.rows[0], `User role successfully updated to ${role}`);
  } catch (err: any) {
    console.error('[Admin Update User Role Error]:', err);
    return errorResponse(err.message || 'Error updating user role', 'INTERNAL_SERVER_ERROR', 500);
  }
}
