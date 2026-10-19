import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireAuth, successResponse, errorResponse } from '@/lib/auth/middleware';
import { joinWaitlistSafe } from '@/lib/services/waitlist';

const joinWaitlistSchema = z.object({
  requestedQuantity: z.number().int().min(1).max(10).default(2),
});

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
  const showId = parseInt(params.id, 10);

  if (isNaN(showId)) {
    return errorResponse('Invalid show ID parameter', 'BAD_REQUEST', 400);
  }

  try {
    const body = await req.json().catch(() => ({}));
    const parseResult = joinWaitlistSchema.safeParse(body);

    if (!parseResult.success) {
      return errorResponse('Validation failed', 'VALIDATION_ERROR', 400, parseResult.error.errors);
    }

    const { requestedQuantity } = parseResult.data;

    const waitlistEntry = await joinWaitlistSafe({
      userId: user.userId,
      showId,
      requestedQuantity,
    });

    return successResponse(
      waitlistEntry,
      `Successfully joined waitlist at FIFO position #${waitlistEntry.position}`,
      201
    );
  } catch (err: any) {
    console.error('[Join Waitlist Error]:', err);

    if (err.message.includes('already have an active waitlist entry')) {
      return errorResponse(err.message, 'WAITLIST_ALREADY_JOINED', 409);
    }

    if (err.message.includes('currently available')) {
      return errorResponse(err.message, 'SHOW_NOT_SOLD_OUT', 400);
    }

    if (err.message.includes('not found')) {
      return errorResponse(err.message, 'NOT_FOUND', 404);
    }

    return errorResponse(err.message || 'Error joining waitlist', 'INTERNAL_SERVER_ERROR', 500);
  }
}
