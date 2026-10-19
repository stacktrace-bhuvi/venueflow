import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, TokenPayload, UserRole } from './jwt';

const COOKIE_NAME = process.env.COOKIE_NAME || 'venueflow_token';

/**
 * Standard JSON response builders for consistent API contract envelopes.
 */
export function successResponse(data: any, message?: string, status: number = 200) {
  return NextResponse.json(
    {
      success: true,
      data,
      ...(message ? { message } : {}),
    },
    { status }
  );
}

export function errorResponse(
  message: string,
  code: string = 'ERROR',
  status: number = 400,
  details?: any
) {
  return NextResponse.json(
    {
      success: false,
      error: {
        code,
        message,
        ...(details ? { details } : {}),
      },
    },
    { status }
  );
}

/**
 * Extract authenticated user payload from Cookie or Authorization Bearer header.
 */
export function getAuthUser(req: NextRequest): TokenPayload | null {
  // 1. Check HTTP-only cookie
  const cookie = req.cookies.get(COOKIE_NAME);
  if (cookie?.value) {
    const verified = verifyToken(cookie.value);
    if (verified) return verified;
  }

  // 2. Check Authorization Bearer header
  const authHeader = req.headers.get('authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    const verified = verifyToken(token);
    if (verified) return verified;
  }

  return null;
}

/**
 * Require valid authentication for a route handler.
 */
export function requireAuth(req: NextRequest): { user: TokenPayload } | { errorResponse: NextResponse } {
  const user = getAuthUser(req);
  if (!user) {
    return {
      errorResponse: errorResponse(
        'Authentication required. Please log in to proceed.',
        'UNAUTHORIZED',
        401
      ),
    };
  }
  return { user };
}

/**
 * Require specific user role(s) (customer, manager, admin) for a route handler.
 */
export function requireRole(
  req: NextRequest,
  allowedRoles: UserRole[]
): { user: TokenPayload } | { errorResponse: NextResponse } {
  const authResult = requireAuth(req);
  if ('errorResponse' in authResult) {
    return authResult;
  }

  const { user } = authResult;
  if (!allowedRoles.includes(user.role)) {
    return {
      errorResponse: errorResponse(
        `Forbidden. This operation requires one of [${allowedRoles.join(', ')}] roles.`,
        'FORBIDDEN',
        403
      ),
    };
  }

  return { user };
}
