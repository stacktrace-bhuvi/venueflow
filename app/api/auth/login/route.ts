import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { query } from '@/lib/db/pg';
import { verifyPassword } from '@/lib/auth/password';
import { signToken } from '@/lib/auth/jwt';
import { errorResponse } from '@/lib/auth/middleware';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1, 'Password is required'),
});

const COOKIE_NAME = process.env.COOKIE_NAME || 'venueflow_token';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parseResult = loginSchema.safeParse(body);

    if (!parseResult.success) {
      return errorResponse('Invalid email or password payload', 'VALIDATION_ERROR', 400);
    }

    const { email, password } = parseResult.data;

    // Fetch user from PostgreSQL
    const res = await query(
      'SELECT id, email, password_hash, full_name, role FROM users WHERE email = $1',
      [email.toLowerCase()]
    );

    if (res.rows.length === 0) {
      return errorResponse('Invalid email or password credentials.', 'INVALID_CREDENTIALS', 401);
    }

    const user = res.rows[0];

    // Verify bcrypt password hash
    const isValid = await verifyPassword(password, user.password_hash);
    if (!isValid) {
      return errorResponse('Invalid email or password credentials.', 'INVALID_CREDENTIALS', 401);
    }

    // Generate JWT token
    const token = signToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      name: user.full_name,
    });

    const response = NextResponse.json(
      {
        success: true,
        data: {
          token,
          user: {
            id: user.id,
            email: user.email,
            name: user.full_name,
            role: user.role,
          },
        },
        message: 'Login successful',
      },
      { status: 200 }
    );

    // Set secure httpOnly cookie
    response.cookies.set({
      name: COOKIE_NAME,
      value: token,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60, // 7 days
    });

    return response;
  } catch (err: any) {
    console.error('[Login Error]:', err);
    return errorResponse(err.message || 'Internal server error during login', 'INTERNAL_SERVER_ERROR', 500);
  }
}
