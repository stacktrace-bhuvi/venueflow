import dotenv from 'dotenv';
dotenv.config();

import { createBookingSafe, cancelBookingSafe } from '../lib/services/booking';
import { query } from '../lib/db/pg';

/**
 * Concurrency Test Suite using REAL PostgreSQL Connection Pool
 * 
 * Executes two competing transactions via Promise.all attempting to book
 * the exact same show seat simultaneously.
 * Asserts:
 * - Exactly ONE transaction succeeds (Status 201 CONFIRMED)
 * - Exactly ONE transaction fails with lock contention / seat unavailable error
 * - Partial UNIQUE index and row-level locks protect the real database
 */

export async function runConcurrentBookingTests(): Promise<boolean> {
  console.log('\n--- Running Concurrency & Double-Booking Prevention Tests (Real PostgreSQL) ---');

  // Find an available seat for Show 1 (Coldplay Night 1)
  const seatRes = await query(
    `SELECT ss.seat_id, ss.show_id, s.row_label, s.seat_number 
     FROM show_seats ss
     JOIN seats s ON ss.seat_id = s.id
     WHERE ss.show_id = 1 AND ss.status = 'AVAILABLE'
     ORDER BY ss.seat_id ASC
     LIMIT 1`
  );

  if (seatRes.rows.length === 0) {
    throw new Error('Test setup error: No available seats found for Show 1.');
  }

  const targetSeat = seatRes.rows[0];
  const targetSeatId = targetSeat.seat_id;
  const showId = targetSeat.show_id;

  console.log(`Targeting Show #${showId}, Seat #${targetSeatId} (${targetSeat.row_label}-${targetSeat.seat_number}) for concurrent race test...`);

  // Two different customers: User 5 (Arjun) and User 6 (Priya)
  const userA = 5;
  const userB = 6;

  let successfulBookingId: number | null = null;

  try {
    // Fire both booking transactions simultaneously
    const [resultA, resultB] = await Promise.allSettled([
      createBookingSafe({
        userId: userA,
        showId,
        seatIds: [targetSeatId],
        paymentMethod: 'CREDIT_CARD',
      }),
      createBookingSafe({
        userId: userB,
        showId,
        seatIds: [targetSeatId],
        paymentMethod: 'UPI',
      }),
    ]);

    const fulfilled = [resultA, resultB].filter((r) => r.status === 'fulfilled') as PromiseFulfilledResult<any>[];
    const rejected = [resultA, resultB].filter((r) => r.status === 'rejected') as PromiseRejectedResult[];

    if (fulfilled.length !== 1 || rejected.length !== 1) {
      throw new Error(
        `Concurrency invariant violated! Expected exactly 1 success and 1 rejection, but got ${fulfilled.length} successes.`
      );
    }

    const winner = fulfilled[0].value;
    successfulBookingId = winner.bookingId;
    const loserError = rejected[0].reason;

    console.log(`✓ Winner: Booking #${winner.bookingId} (${winner.bookingReference}) confirmed for User.`);
    console.log(`✓ Rejected: Concurrent transaction failed safely with: "${loserError.message}"`);

    // Verify database state: seat MUST be BOOKED exactly once
    const checkRes = await query(
      `SELECT status, held_by FROM show_seats WHERE show_id = $1 AND seat_id = $2`,
      [showId, targetSeatId]
    );

    if (checkRes.rows[0].status !== 'BOOKED') {
      throw new Error(`Expected seat status to be BOOKED, found: ${checkRes.rows[0].status}`);
    }

    console.log('✓ Verified in real PostgreSQL: Seat is marked BOOKED exactly once.');

    return true;
  } finally {
    // Cleanup: Cancel the test booking and restore the seat to AVAILABLE
    if (successfulBookingId) {
      try {
        await cancelBookingSafe(successfulBookingId, userA, true);
        console.log(`✓ Test cleanup completed: Booking #${successfulBookingId} cancelled, seat released.`);
      } catch (cleanErr) {
        console.warn('Cleanup error:', cleanErr);
      }
    }
  }
}

if (require.main === module) {
  runConcurrentBookingTests()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
