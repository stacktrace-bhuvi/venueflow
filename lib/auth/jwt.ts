import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'venueflow-dev-secret-key-change-in-production-min32chars';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

export type UserRole = 'customer' | 'manager' | 'admin';

export interface TokenPayload {
  userId: number;
  email: string;
  role: UserRole;
  name: string;
}

/**
 * Sign a JWT token containing user identity and role.
 */
export function signToken(payload: TokenPayload): string {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN as any,
  });
}

/**
 * Verify and decode a JWT token.
 */
export function verifyToken(token: string): TokenPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as TokenPayload;
  } catch {
    return null;
  }
}
