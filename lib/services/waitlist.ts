import { PoolClient } from 'pg';
import { getClient, query } from '../db/pg';

/**
 * Automated Waitlist Service for VenueFlow.
 * 
 * Manages FIFO queue priority, requested quantity validation, time-limited
 * promotion holds (15 minutes), and automatic promotion cascading upon
 * booking cancellations or hold expiration.
 */

export interface JoinWaitlistParams {
  userId: number;
  showId: number;
  requestedQuantity: number;
}

export interface WaitlistRecord {
  id: number;
  showId: number;
  userId: number;
  requestedQuantity: number;
  position: number;
  status: 'WAITING' | 'PROMOTED' | 'EXPIRED' | 'FULFILLED' | 'CANCELLED';
  promotedUntil: Date | null;
  createdAt: Date;
}

/**
 * Join FIFO waitlist for a sold-out show.
 */
export async function joinWaitlistSafe(params: JoinWaitlistParams): Promise<WaitlistRecord> {
  const { userId, showId, requestedQuantity } = params;

  if (requestedQuantity < 1 || requestedQuantity > 10) {
    throw new Error('Requested quantity must be between 1 and 10 tickets.');
  }

  const client: PoolClient = await getClient();

  try {
    await client.query('BEGIN');

    // 1. Verify show exists and check availability
    const showRes = await client.query(
      `SELECT s.id, s.start_time, s.status,
              COUNT(ss.id) FILTER (WHERE ss.status = 'AVAILABLE') as available_count
       FROM shows s
       LEFT JOIN show_seats ss ON s.id = ss.show_id
       WHERE s.id = $1
       GROUP BY s.id`,
      [showId]
    );

    if (showRes.rows.length === 0) {
      throw new Error(`Show #${showId} not found.`);
    }

    const show = showRes.rows[0];

    if (new Date(show.start_time) <= new Date()) {
      throw new Error('Cannot join waitlist for a past show.');
    }

    const availableCount = parseInt(show.available_count || '0', 10);
    if (availableCount > 0 && show.status !== 'SOLD_OUT') {
      throw new Error('Tickets are currently available. You can book directly without joining the waitlist.');
    }

    // 2. Prevent duplicate active waitlist entries for the same user on this show
    const existingRes = await client.query(
      `SELECT id FROM waitlist_entries 
       WHERE show_id = $1 AND user_id = $2 AND status IN ('WAITING', 'PROMOTED')`,
      [showId, userId]
    );

    if (existingRes.rows.length > 0) {
      throw new Error('You already have an active waitlist entry for this show.');
    }

    // 3. Compute next FIFO position using MAX(position) + 1
    const posRes = await client.query(
      `SELECT COALESCE(MAX(position), 0) + 1 as next_position 
       FROM waitlist_entries 
       WHERE show_id = $1`,
      [showId]
    );

    const nextPosition = parseInt(posRes.rows[0].next_position, 10);

    // 4. Insert waitlist record
    const insertRes = await client.query(
      `INSERT INTO waitlist_entries (show_id, user_id, requested_quantity, position, status)
       VALUES ($1, $2, $3, $4, 'WAITING')
       RETURNING id, show_id, user_id, requested_quantity, position, status, promoted_until, created_at`,
      [showId, userId, requestedQuantity, nextPosition]
    );

    await client.query('COMMIT');

    const row = insertRes.rows[0];
    return {
      id: row.id,
      showId: row.show_id,
      userId: row.user_id,
      requestedQuantity: row.requested_quantity,
      position: row.position,
      status: row.status,
      promotedUntil: row.promoted_until,
      createdAt: row.created_at,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Promote waiting customers in FIFO order and place available seats on temporary HOLD.
 */
export async function processWaitlistPromotions(
  showId: number,
  availableSeatCount: number
): Promise<Array<{ waitlistId: number; userId: number; quantity: number }>> {
  const client: PoolClient = await getClient();

  try {
    await client.query('BEGIN');

    // Call stored function
    const promRes = await client.query(
      `SELECT promoted_waitlist_id, promoted_user_id, allocated_quantity 
       FROM promote_waitlist_fifo($1, $2)`,
      [showId, availableSeatCount]
    );

    const promotions = promRes.rows.map((r) => ({
      waitlistId: r.promoted_waitlist_id,
      userId: r.promoted_user_id,
      quantity: r.allocated_quantity,
    }));

    await client.query('COMMIT');
    return promotions;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Expire stale waitlist promotions and cascade available seats to the next entrants in FIFO order.
 */
export async function cascadeExpiredWaitlistPromotions(showId: number): Promise<number> {
  const client: PoolClient = await getClient();

  try {
    await client.query('BEGIN');

    // 1. Identify expired promotions
    const expiredRes = await client.query(
      `SELECT id, user_id, requested_quantity 
       FROM waitlist_entries 
       WHERE show_id = $1 AND status = 'PROMOTED' AND promoted_until < NOW()
       FOR UPDATE`,
      [showId]
    );

    const expiredEntries = expiredRes.rows;
    if (expiredEntries.length === 0) {
      await client.query('COMMIT');
      return 0;
    }

    let freedSeatsCount = 0;

    for (const entry of expiredEntries) {
      // Transition to EXPIRED
      await client.query(
        `UPDATE waitlist_entries SET status = 'EXPIRED', updated_at = NOW() WHERE id = $1`,
        [entry.id]
      );

      // Release seats held by this user
      const releaseRes = await client.query(
        `UPDATE show_seats 
         SET status = 'AVAILABLE', held_by = NULL, hold_expires_at = NULL, updated_at = NOW()
         WHERE show_id = $1 AND held_by = $2 AND status = 'HELD'`,
        [showId, entry.user_id]
      );

      freedSeatsCount += releaseRes.rowCount || 0;
    }

    await client.query('COMMIT');

    // 2. Cascade freed seats to next FIFO customer
    if (freedSeatsCount > 0) {
      await processWaitlistPromotions(showId, freedSeatsCount);
    }

    return expiredEntries.length;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
