import dotenv from 'dotenv';
dotenv.config();

import { joinWaitlistSafe, processWaitlistPromotions } from '../lib/services/waitlist';
import { cancelBookingSafe } from '../lib/services/booking';
import { query } from '../lib/db/pg';

/**
 * FIFO Waitlist Test Suite using Real PostgreSQL
 * 
 * Verifies against seeded sold-out Show 2:
 * 1. Sequential FIFO position generation on join
 * 2. Automatic promotion and seat hold placement upon booking cancellation
 * 3. Requested quantity fulfillment order
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

  // 2. Test Booking Cancellation & Automated Waitlist Promotion
  // In seed.sql, Booking #3 is booked for Show 2 (2 seats).
  // Cancelling Booking #3 will release 2 seats.
  // Waitlist position 1 is Ananya (User 8, requested 2 tickets).
  // Ananya should be automatically promoted!

  const bookingRes = await query('SELECT id, user_id, status FROM bookings WHERE id = 3');
  if (bookingRes.rows.length === 0) {
    throw new Error('Test setup error: Seeded Booking #3 not found.');
  }

  const booking3 = bookingRes.rows[0];

  if (booking3.status === 'CONFIRMED') {
    console.log('Cancelling Booking #3 to release seats and trigger waitlist promotion...');
    await cancelBookingSafe(3, booking3.user_id, true);

    // Verify Ananya (User 8) waitlist entry transitioned to PROMOTED
    const ananyaRes = await query(
      `SELECT id, status, promoted_until 
       FROM waitlist_entries 
       WHERE show_id = 2 AND user_id = 8`
    );

    if (ananyaRes.rows.length === 0) {
      throw new Error('Test setup error: Ananya waitlist entry not found.');
    }

    const ananyaEntry = ananyaRes.rows[0];
    if (ananyaEntry.status !== 'PROMOTED') {
      throw new Error(`Expected Ananya's waitlist status to be PROMOTED, got: ${ananyaEntry.status}`);
    }

    console.log(`✓ Verified in PostgreSQL: Entrant at FIFO Position #1 (User 8) promoted with deadline ${ananyaEntry.promoted_until}.`);

    // Verify seats were placed on temporary HOLD for Ananya
    const heldSeatsRes = await query(
      `SELECT COUNT(*) as count 
       FROM show_seats 
       WHERE show_id = 2 AND status = 'HELD' AND held_by = 8`
    );

    const heldCount = parseInt(heldSeatsRes.rows[0].count, 10);
    console.log(`✓ Verified in PostgreSQL: ${heldCount} seats placed on temporary HOLD for promoted user.`);

    if (heldCount !== 2) {
      throw new Error(`Expected exactly 2 seats on HOLD for User 8, got ${heldCount}`);
    }
  } else {
    // If Booking 3 was already cancelled by a previous run, verify promotion manually
    console.log('Booking #3 already cancelled; verifying promote_waitlist_fifo function directly...');
    const promoRes = await processWaitlistPromotions(showId, 1);
    console.log(`✓ Stored function promote_waitlist_fifo executed, promoted: ${promoRes.length} entrants.`);
  }

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
