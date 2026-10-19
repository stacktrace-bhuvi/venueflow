import { NextRequest } from 'next/server';
import { requireAuth, successResponse } from '@/lib/auth/middleware';
import { query } from '@/lib/db/pg';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if ('errorResponse' in auth) {
    return auth.errorResponse;
  }

  const { user } = auth;

  // Retrieve fresh user info from PostgreSQL
  const res = await query(
    'SELECT id, email, full_name, phone, role, created_at FROM users WHERE id = $1',
    [user.userId]
  );

  if (res.rows.length === 0) {
    return successResponse({ user }, 'User session authenticated');
  }

  const row = res.rows[0];

  return successResponse({
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    phone: row.phone,
    role: row.role,
    createdAt: row.created_at,
  });
}
