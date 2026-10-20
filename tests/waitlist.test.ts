import dotenv from 'dotenv';
dotenv.config();

import { joinWaitlistSafe, cascadeExpiredWaitlistPromotions } from '../lib/services/waitlist';
import { cancelBookingSafe } from '../lib/services/booking';
import { query } from '../lib/db/pg';

/**
 * FIFO Waitlist Test Suite using Real PostgreSQL
 * 
 * Verifies:
 * 1. Sequential FIFO position generation on join
 * 2. Booking cancellation promotion with spare AVAILABLE seats on a show:
 *    Proving only the first FIFO entrant is promoted and holds exactly requested_quantity seats.
 * 3. Expired waitlist promotion cascading to the next FIFO entrant.
 */

export async function runWaitlistTests(): Promise<boolean> {
  console.log('\n--- Running FIFO Waitlist Promotion Tests (Real PostgreSQL) ---');

  const showId = 2; // Show 2 is seeded as SOLD OUT

  // 1. Test Joining the Waitlist (User 11: Vikram Singh)
  const testUserId = 11;
  const requestedQty = 2;

  // Clean any previous test entries for User 11 on Show 2
  await query('DELETE FROM waitlist_entries WHERE show_id = $1 AND user_id = $2', [showId, testUserId]);

  const entry = await joinWaitlistSafe({
    userId: testUserId,
    showId,
    requestedQuantity: requestedQty,
  });

  if (entry.status !== 'WAITING' || entry.position < 3) {
    throw new Error(`Waitlist join failed: Expected position >= 3 and status WAITING, got pos=${entry.position}, status=${entry.status}`);
  }
  console.log(`✓ User #11 joined waitlist in PostgreSQL at FIFO position #${entry.position}.`);

  // 2. Test Booking Cancellation with Spare AVAILABLE Seats
  // Ensure Show 2 has spare AVAILABLE seats (3 spare seats), plus waitlist has User 8 (pos 1, qty 2) and User 9 (pos 2, qty 1).
  await query(
    `UPDATE show_seats 
     SET status = 'AVAILABLE', held_by = NULL, hold_expires_at = NULL 
     WHERE show_id = $1 AND seat_id IN (10, 11, 12)`,
    [showId]
  );

  // Ensure User 8 and User 9 are in WAITING status before cancellation
  await query(
    `UPDATE waitlist_entries 
     SET status = 'WAITING', promoted_until = NULL 
     WHERE show_id = $1 AND user_id IN (8, 9, 10)`,
    [showId]
  );

  // Seeded Booking #3 (User 7, 2 seats: seat_id 1, 2)
  const bookingRes = await query('SELECT id, user_id, status FROM bookings WHERE id = 3');
  if (bookingRes.rows.length === 0) {
    throw new Error('Test setup error: Seeded Booking #3 not found.');
  }

  const booking3 = bookingRes.rows[0];
  if (booking3.status !== 'CONFIRMED') {
    // If previously cancelled, re-confirm booking 3 for this test
    await query(`UPDATE bookings SET status = 'CONFIRMED' WHERE id = 3`);
    await query(`UPDATE show_seats SET status = 'BOOKED', held_by = NULL WHERE show_id = $1 AND seat_id IN (1, 2)`, [showId]);
  }

  console.log('Cancelling Booking #3 (2 seats) in presence of spare AVAILABLE seats...');
  await cancelBookingSafe(3, booking3.user_id, true);

  // Invariant 1: Only the first FIFO entrant (User 8, requested 2) must be promoted
  const waitlistStatusRes = await query(
    `SELECT user_id, position, status, requested_quantity 
     FROM waitlist_entries 
     WHERE show_id = $1 AND user_id IN (8, 9, 10)
     ORDER BY position ASC`,
    [showId]
  );

  const user8Entry = waitlistStatusRes.rows.find((r) => r.user_id === 8);
  const user9Entry = waitlistStatusRes.rows.find((r) => r.user_id === 9);
  const user10Entry = waitlistStatusRes.rows.find((r) => r.user_id === 10);

  if (!user8Entry || user8Entry.status !== 'PROMOTED') {
    throw new Error(`Expected first FIFO entrant (User 8) to be PROMOTED, got: ${user8Entry?.status}`);
  }

  if (!user9Entry || user9Entry.status !== 'WAITING') {
    throw new Error(`Expected second FIFO entrant (User 9) to remain WAITING despite spare available seats, got: ${user9Entry?.status}`);
  }

  if (!user10Entry || user10Entry.status !== 'WAITING') {
    throw new Error(`Expected third FIFO entrant (User 10) to remain WAITING, got: ${user10Entry?.status}`);
  }
  console.log('✓ Verified: Only first FIFO entrant (User 8) was promoted; subsequent entrants remained WAITING.');

  // Invariant 2: User 8 holds EXACTLY requested_quantity (2) seats
  const user8HeldRes = await query(
    `SELECT COUNT(*) as count 
     FROM show_seats 
     WHERE show_id = $1 AND status = 'HELD' AND held_by = 8`,
    [showId]
  );
  const user8HeldCount = parseInt(user8HeldRes.rows[0].count, 10);

  if (user8HeldCount !== 2) {
    throw new Error(`Expected User 8 to hold exactly requested_quantity (2) seats, but found ${user8HeldCount} held seats!`);
  }
  console.log(`✓ Verified: User 8 holds exactly ${user8HeldCount} seats on HELD (no double-holding or spare seat leakage).`);

  // 3. Test Expired Waitlist Promotion Cascade to Next Entrant
  console.log('Testing expired waitlist promotion cascade to next FIFO entrant...');
  // Artificially expire User 8's promotion deadline
  await query(
    `UPDATE waitlist_entries 
     SET promoted_until = NOW() - INTERVAL '1 minute' 
     WHERE show_id = $1 AND user_id = 8`,
    [showId]
  );

  // Trigger cascade
  const expiredCount = await cascadeExpiredWaitlistPromotions(showId);
  if (expiredCount !== 1) {
    throw new Error(`Expected cascade to process 1 expired promotion, got: ${expiredCount}`);
  }

  // Verify User 8 is now EXPIRED and holds 0 seats
  const user8AfterCascade = await query(
    `SELECT status FROM waitlist_entries WHERE show_id = $1 AND user_id = 8`,
    [showId]
  );
  if (user8AfterCascade.rows[0].status !== 'EXPIRED') {
    throw new Error(`Expected User 8 status to transition to EXPIRED, got: ${user8AfterCascade.rows[0].status}`);
  }

  const user8SeatsAfterCascade = await query(
    `SELECT COUNT(*) as count FROM show_seats WHERE show_id = $1 AND held_by = 8 AND status = 'HELD'`,
    [showId]
  );
  if (parseInt(user8SeatsAfterCascade.rows[0].count, 10) !== 0) {
    throw new Error('Expected 0 seats held by expired User 8.');
  }

  // Verify next FIFO entrant (User 9, requested 1 seat) is now PROMOTED and holds exactly 1 seat
  const user9AfterCascade = await query(
    `SELECT status FROM waitlist_entries WHERE show_id = $1 AND user_id = 9`,
    [showId]
  );
  if (user9AfterCascade.rows[0].status !== 'PROMOTED') {
    throw new Error(`Expected next FIFO entrant (User 9) to be PROMOTED upon cascade, got: ${user9AfterCascade.rows[0].status}`);
  }

  const user9HeldRes = await query(
    `SELECT COUNT(*) as count FROM show_seats WHERE show_id = $1 AND held_by = 9 AND status = 'HELD'`,
    [showId]
  );
  const user9HeldCount = parseInt(user9HeldRes.rows[0].count, 10);
  if (user9HeldCount !== 1) {
    throw new Error(`Expected User 9 to hold exactly 1 seat upon cascade, got: ${user9HeldCount}`);
  }

  // User 10 (requested 2) did not fit into remaining 1 freed seat, so remains WAITING
  const user10AfterCascade = await query(
    `SELECT status FROM waitlist_entries WHERE show_id = $1 AND user_id = 10`,
    [showId]
  );
  if (user10AfterCascade.rows[0].status !== 'WAITING') {
    throw new Error(`Expected User 10 to remain WAITING, got: ${user10AfterCascade.rows[0].status}`);
  }
  console.log(`✓ Verified: Expired promotion for User 8 cascaded to User 9 (now PROMOTED, holding 1 seat).`);

  // Cleanup Vikram's test waitlist entry
  await query('DELETE FROM waitlist_entries WHERE show_id = $1 AND user_id = $2', [showId, testUserId]);

  return true;
}

if (require.main === module) {
  runWaitlistTests()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
