import { NextRequest } from 'next/server';
import { requireRole, successResponse, errorResponse } from '@/lib/auth/middleware';
import { query } from '@/lib/db/pg';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = requireRole(req, ['admin']);
  if ('errorResponse' in auth) {
    return auth.errorResponse;
  }

  try {
    const { searchParams } = new URL(req.url);
    const roleFilter = searchParams.get('role');
    const search = searchParams.get('q');

    const conditions: string[] = [];
    const values: any[] = [];
    let pIdx = 1;

    if (roleFilter && ['customer', 'manager', 'admin'].includes(roleFilter)) {
      conditions.push(`u.role = $${pIdx}`);
      values.push(roleFilter);
      pIdx++;
    }

    if (search) {
      conditions.push(`(u.full_name ILIKE $${pIdx} OR u.email ILIKE $${pIdx})`);
      values.push(`%${search}%`);
      pIdx++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const sql = `
      SELECT 
        u.id, u.email, u.full_name, u.phone, u.role, u.created_at,
        COUNT(b.id) as total_bookings,
        COALESCE(SUM(b.total_amount) FILTER (WHERE b.status = 'CONFIRMED'), 0.00) as total_spent
      FROM users u
      LEFT JOIN bookings b ON u.id = b.user_id
      ${whereClause}
      GROUP BY u.id, u.email, u.full_name, u.phone, u.role, u.created_at
      ORDER BY u.created_at DESC
      LIMIT 100
    `;

    const res = await query(sql, values);

    return successResponse({
      users: res.rows.map((r) => ({
        id: r.id,
        email: r.email,
        fullName: r.full_name,
        phone: r.phone,
        role: r.role,
        createdAt: r.created_at,
        totalBookings: parseInt(r.total_bookings || '0', 10),
        totalSpent: parseFloat(r.total_spent || '0.00'),
      })),
    });
  } catch (err: any) {
    console.error('[Admin Users Error]:', err);
    return errorResponse(err.message || 'Error fetching users', 'INTERNAL_SERVER_ERROR', 500);
  }
}
