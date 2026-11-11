import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireAuth, successResponse, errorResponse } from '@/lib/auth/middleware';
import { getClient, query } from '@/lib/db/pg';

/**
 * Seat holds — temporary exclusive reservation while a customer decides.
 *
 * POST   acquire or extend a hold on seats (transaction + SELECT ... FOR UPDATE)
 * DELETE release seats this user holds
 * GET    lightweight poll: which seats this user holds, plus every seat's status
 *
 * The GET deliberately does NOT recompute the dynamic price. The main
 * /shows/:id/seats endpoint does, and that writes a price_history row on every
 * call — polling it would flood the ledger. This returns statuses only.
 */

const HOLD_MINUTES = Math.max(1, parseInt(process.env.SEAT_HOLD_DURATION_MINUTES || '10', 10));

const seatIdsSchema = z.object({
  seatIds: z.array(z.number().int().positive()).min(1).max(10),
});

export const dynamic = 'force-dynamic';

/* ------------------------------------------------------------------ POST */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = requireAuth(req);
  if ('errorResponse' in auth) return auth.errorResponse;

  const { user } = auth;
  const showId = parseInt(params.id, 10);
  if (isNaN(showId)) return errorResponse('Invalid show ID', 'BAD_REQUEST', 400);

  const body = await req.json().catch(() => ({}));
  const parsed = seatIdsSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse('Validation failed', 'VALIDATION_ERROR', 400, parsed.error.errors);
  }
  const { seatIds } = parsed.data;

  const client = await getClient();
  try {
    await client.query('BEGIN');

    // Clear anyone's expired holds on this show first
    await client.query(
      `UPDATE show_seats
       SET status = 'AVAILABLE', held_by = NULL, hold_expires_at = NULL, updated_at = NOW()
       WHERE show_id = $1 AND status = 'HELD' AND hold_expires_at < NOW()`,
      [showId]
    );

    // Lock the requested rows. Consistent ORDER BY prevents deadlocks between
    // two users selecting overlapping seats in opposite orders.
    const locked = await client.query(
      `SELECT ss.id, ss.seat_id, ss.status, ss.held_by, s.row_label, s.seat_number
       FROM show_seats ss
       JOIN seats s ON ss.seat_id = s.id
       WHERE ss.show_id = $1 AND ss.seat_id = ANY($2::int[])
       ORDER BY ss.id ASC
       FOR UPDATE`,
      [showId, seatIds]
    );

    if (locked.rows.length !== seatIds.length) {
      await client.query('ROLLBACK');
      return errorResponse('One or more seats do not exist for this show.', 'NOT_FOUND', 404);
    }

    for (const seat of locked.rows) {
      if (seat.status === 'BOOKED') {
        await client.query('ROLLBACK');
        return errorResponse(
          `Seat ${seat.row_label}${seat.seat_number} has just been booked.`,
          'SEATS_UNAVAILABLE',
          409
        );
      }
      if (seat.status === 'HELD' && seat.held_by !== user.userId) {
        await client.query('ROLLBACK');
        return errorResponse(
          `Seat ${seat.row_label}${seat.seat_number} is being held by another customer.`,
          'SEATS_UNAVAILABLE',
          409
        );
      }
    }

    const res = await client.query(
      `UPDATE show_seats
       SET status = 'HELD',
           held_by = $3,
           hold_expires_at = NOW() + ($4 * INTERVAL '1 minute'),
           updated_at = NOW()
       WHERE show_id = $1 AND seat_id = ANY($2::int[])
       RETURNING seat_id, hold_expires_at`,
      [showId, seatIds, user.userId, HOLD_MINUTES]
    );

    await client.query('COMMIT');

    return successResponse(
      {
        heldSeatIds: res.rows.map((r) => r.seat_id),
        holdExpiresAt: res.rows[0]?.hold_expires_at ?? null,
        holdMinutes: HOLD_MINUTES,
      },
      `Seats held for ${HOLD_MINUTES} minutes`
    );
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('[Hold Seats Error]:', err);
    return errorResponse(err.message || 'Error holding seats', 'INTERNAL_SERVER_ERROR', 500);
  } finally {
    client.release();
  }
}

/* ---------------------------------------------------------------- DELETE */
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = requireAuth(req);
  if ('errorResponse' in auth) return auth.errorResponse;

  const { user } = auth;
  const showId = parseInt(params.id, 10);
  if (isNaN(showId)) return errorResponse('Invalid show ID', 'BAD_REQUEST', 400);

  const body = await req.json().catch(() => ({}));
  const seatIds: number[] | null = Array.isArray(body?.seatIds) && body.seatIds.length ? body.seatIds : null;

  try {
    // Only ever releases rows this user holds — never anyone else's.
    const res = await query(
      `UPDATE show_seats
       SET status = 'AVAILABLE', held_by = NULL, hold_expires_at = NULL, updated_at = NOW()
       WHERE show_id = $1
         AND status = 'HELD'
         AND held_by = $2
         ${seatIds ? 'AND seat_id = ANY($3::int[])' : ''}
       RETURNING seat_id`,
      seatIds ? [showId, user.userId, seatIds] : [showId, user.userId]
    );

    return successResponse({ releasedSeatIds: res.rows.map((r) => r.seat_id) }, 'Seats released');
  } catch (err: any) {
    console.error('[Release Seats Error]:', err);
    return errorResponse(err.message || 'Error releasing seats', 'INTERNAL_SERVER_ERROR', 500);
  }
}

/* ------------------------------------------------------------------- GET */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const showId = parseInt(params.id, 10);
  if (isNaN(showId)) return errorResponse('Invalid show ID', 'BAD_REQUEST', 400);

  const auth = requireAuth(req);
  const userId = 'user' in auth ? auth.user.userId : null;

  try {
    // Lazy expiry, same as everywhere else
    await query(
      `UPDATE show_seats
       SET status = 'AVAILABLE', held_by = NULL, hold_expires_at = NULL, updated_at = NOW()
       WHERE show_id = $1 AND status = 'HELD' AND hold_expires_at < NOW()`,
      [showId]
    );

    const res = await query(
      `SELECT seat_id, status, held_by, hold_expires_at
       FROM show_seats
       WHERE show_id = $1`,
      [showId]
    );

    const mine = res.rows.filter((r) => r.status === 'HELD' && userId !== null && r.held_by === userId);

    return successResponse({
      seats: res.rows.map((r) => ({ seatId: r.seat_id, status: r.status })),
      myHeldSeatIds: mine.map((r) => r.seat_id),
      holdExpiresAt: mine[0]?.hold_expires_at ?? null,
    });
  } catch (err: any) {
    console.error('[Seat Status Error]:', err);
    return errorResponse(err.message || 'Error fetching seat status', 'INTERNAL_SERVER_ERROR', 500);
  }
}
