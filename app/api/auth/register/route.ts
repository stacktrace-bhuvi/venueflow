import { NextRequest } from 'next/server';
import { z } from 'zod';
import { query } from '@/lib/db/pg';
import { hashPassword } from '@/lib/auth/password';
import { successResponse, errorResponse } from '@/lib/auth/middleware';

const registerSchema = z.object({
  email: z.string().email('Invalid email address format'),
  password: z.string().min(8, 'Password must be at least 8 characters long'),
  fullName: z.string().min(2, 'Full name is required'),
  phone: z.string().optional(),
  role: z.enum(['customer', 'manager']).default('customer'),
});

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parseResult = registerSchema.safeParse(body);

    if (!parseResult.success) {
      return errorResponse(
        'Validation failed',
        'VALIDATION_ERROR',
        400,
        parseResult.error.errors
      );
    }

    const { email, password, fullName, phone, role } = parseResult.data;

    // Check if user already exists
    const existing = await query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (existing.rows.length > 0) {
      return errorResponse('An account with this email already exists.', 'EMAIL_EXISTS', 409);
    }

    // Hash password with bcrypt (enforcing no plaintext storage)
    const passwordHash = await hashPassword(password);

    // Insert user into PostgreSQL
    const insertRes = await query(
      `INSERT INTO users (email, password_hash, full_name, phone, role)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, email, full_name, role, created_at`,
      [email.toLowerCase(), passwordHash, fullName, phone || null, role]
    );

    const user = insertRes.rows[0];

    return successResponse(
      {
        user: {
          id: user.id,
          email: user.email,
          fullName: user.full_name,
          role: user.role,
          createdAt: user.created_at,
        },
      },
      'User registered successfully',
      201
    );
  } catch (err: any) {
    console.error('[Register Error]:', err);
    return errorResponse(
      err.message || 'Internal server error during registration',
      'INTERNAL_SERVER_ERROR',
      500
    );
  }
}
