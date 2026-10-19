import { NextRequest } from 'next/server';
import { requireAuth, successResponse, errorResponse } from '@/lib/auth/middleware';
import { cancelBookingSafe } from '@/lib/services/booking';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = requireAuth(req);
  if ('errorResponse' in auth) {
    return auth.errorResponse;
  }

  const { user } = auth;
  const bookingId = parseInt(params.id, 10);

  if (isNaN(bookingId)) {
    return errorResponse('Invalid booking ID parameter', 'BAD_REQUEST', 400);
  }

  try {
    const result = await cancelBookingSafe(
      bookingId,
      user.userId,
      user.role === 'admin'
    );

    return successResponse(
      result,
      `Booking #${bookingId} successfully cancelled. Seats released.`
    );
  } catch (err: any) {
    console.error('[Cancel Booking Error]:', err);

    if (err.message.includes('Forbidden')) {
      return errorResponse(err.message, 'FORBIDDEN', 403);
    }

    if (err.message.includes('already cancelled')) {
      return errorResponse(err.message, 'ALREADY_CANCELLED', 400);
    }

    if (err.message.includes('not found')) {
      return errorResponse(err.message, 'NOT_FOUND', 404);
    }

    return errorResponse(err.message || 'Error cancelling booking', 'INTERNAL_SERVER_ERROR', 500);
  }
}
