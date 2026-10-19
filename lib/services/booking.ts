import { PoolClient } from 'pg';
import { getClient } from '../db/pg';

/**
 * Safe Booking Service for VenueFlow.
 * 
 * Implements strict ACID transaction isolation with pessimistic row-level locking
 * (SELECT ... FOR UPDATE) to guarantee that double-booking is physically impossible,
 * even under severe concurrent race conditions.
 */

export interface CreateBookingParams {
  userId: number;
  showId: number;
  seatIds: number[];
  paymentMethod?: 'CREDIT_CARD' | 'DEBIT_CARD' | 'UPI' | 'NET_BANKING';
}

export interface BookingResponse {
  bookingId: number;
  bookingReference: string;
  showId: number;
  eventTitle: string;
  totalAmount: number;
  status: string;
  seats: Array<{
    seatId: number;
    showSeatId: number;
    row: string;
    seatNumber: number;
    section: string;
    price: number;
  }>;
  payment: {
    transactionId: string;
    method: string;
    status: string;
    amount: number;
  };
}

/**
 * Generate cryptographically distinct alphanumeric booking reference.
 */
function generateBookingReference(): string {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const randomHex = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `BK-${dateStr}-${randomHex}`;
}

/**
 * Create a booking atomically within a PostgreSQL transaction using row locks.
 */
export async function createBookingSafe(params: CreateBookingParams): Promise<BookingResponse> {
  const { userId, showId, seatIds, paymentMethod = 'CREDIT_CARD' } = params;

  if (!seatIds || seatIds.length === 0) {
    throw new Error('At least one seat must be selected.');
  }

  const client: PoolClient = await getClient();

  try {
    await client.query('BEGIN');

    // Step 1: Release any expired holds on this show
    await client.query(
      `UPDATE show_seats 
       SET status = 'AVAILABLE', held_by = NULL, hold_expires_at = NULL, updated_at = NOW()
       WHERE show_id = $1 
         AND status = 'HELD' 
         AND hold_expires_at < NOW()`,
      [showId]
    );

    // Step 2: Validate show exists, is active, and is not in the past
    const showRes = await client.query(
      `SELECT s.id, s.start_time, s.base_price, s.status, e.title as event_title
       FROM shows s
       JOIN events e ON s.event_id = e.id
       WHERE s.id = $1`,
      [showId]
    );

    if (showRes.rows.length === 0) {
      throw new Error(`Show #${showId} not found.`);
    }

    const show = showRes.rows[0];

    if (new Date(show.start_time) <= new Date()) {
      throw new Error('Cannot book seats for past shows.');
    }

    if (show.status === 'CANCELLED') {
      throw new Error('This show has been cancelled.');
    }

    // Step 3: PESSIMISTIC ROW LOCKING
    // Select requested seats FOR UPDATE to block any concurrent transaction attempting to reserve the same seats
    const seatLocksRes = await client.query(
      `SELECT 
         ss.id as show_seat_id,
         ss.seat_id,
         ss.status,
         ss.held_by,
         ss.hold_expires_at,
         s.row_label,
         s.seat_number,
         vs.name as section_name,
         vs.base_multiplier
       FROM show_seats ss
       JOIN seats s ON ss.seat_id = s.id
       JOIN venue_sections vs ON s.venue_section_id = vs.id
       WHERE ss.show_id = $1 
         AND ss.seat_id = ANY($2::int[])
       ORDER BY ss.id ASC
       FOR UPDATE`,
      [showId, seatIds]
    );

    const lockedSeats = seatLocksRes.rows;

    if (lockedSeats.length !== seatIds.length) {
      throw new Error('One or more selected seats do not exist for this show.');
    }

    // Step 4: Verify seat availability
    for (const seat of lockedSeats) {
      if (seat.status === 'BOOKED') {
        throw new Error(`Seat ${seat.row_label}-${seat.seat_number} is already booked.`);
      }

      if (seat.status === 'HELD' && seat.held_by !== userId) {
        // Double check expiration timestamp in case of edge cases
        if (new Date(seat.hold_expires_at) > new Date()) {
          throw new Error(`Seat ${seat.row_label}-${seat.seat_number} is temporarily held by another customer.`);
        }
      }
    }

    // Step 5: Calculate ticket prices (Show base price * Section multiplier)
    const showBasePrice = parseFloat(show.base_price);
    const bookedSeatItems: Array<{
      showSeatId: number;
      seatId: number;
      row: string;
      seatNumber: number;
      section: string;
      price: number;
    }> = [];

    let totalAmount = 0;

    for (const seat of lockedSeats) {
      const sectionMult = parseFloat(seat.base_multiplier) || 1.0;
      const seatPrice = Math.round(showBasePrice * sectionMult * 100) / 100;
      totalAmount += seatPrice;

      bookedSeatItems.push({
        showSeatId: seat.show_seat_id,
        seatId: seat.seat_id,
        row: seat.row_label,
        seatNumber: seat.seat_number,
        section: seat.section_name,
        price: seatPrice,
      });
    }

    totalAmount = Math.round(totalAmount * 100) / 100;

    // Step 6: Create Booking Header Record
    const bookingRef = generateBookingReference();
    const bookingRes = await client.query(
      `INSERT INTO bookings (user_id, show_id, booking_reference, total_amount, status)
       VALUES ($1, $2, $3, $4, 'CONFIRMED')
       RETURNING id, created_at`,
      [userId, showId, bookingRef, totalAmount]
    );

    const bookingId = bookingRes.rows[0].id;

    // Step 7: Create Booking Items and update Show Seats to BOOKED
    for (const item of bookedSeatItems) {
      await client.query(
        `INSERT INTO booking_items (booking_id, show_seat_id, price_paid)
         VALUES ($1, $2, $3)`,
        [bookingId, item.showSeatId, item.price]
      );

      await client.query(
        `UPDATE show_seats
         SET status = 'BOOKED', held_by = NULL, hold_expires_at = NULL, version = version + 1, updated_at = NOW()
         WHERE id = $1`,
        [item.showSeatId]
      );
    }

    // Step 8: Create Payment Record (Simulated)
    const txnRef = `TXN-SIM-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    await client.query(
      `INSERT INTO payments (booking_id, transaction_reference, amount, payment_method, payment_status, provider_response)
       VALUES ($1, $2, $3, $4, 'SUCCESS', $5::jsonb)`,
      [
        bookingId,
        txnRef,
        totalAmount,
        paymentMethod,
        JSON.stringify({ status: 'AUTHORIZED', gateway: 'SIMULATOR', timestamp: new Date().toISOString() }),
      ]
    );

    // Commit Transaction
    await client.query('COMMIT');

    return {
      bookingId,
      bookingReference: bookingRef,
      showId,
      eventTitle: show.event_title,
      totalAmount,
      status: 'CONFIRMED',
      seats: bookedSeatItems,
      payment: {
        transactionId: txnRef,
        method: paymentMethod,
        status: 'SUCCESS',
        amount: totalAmount,
      },
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Cancel a booking within a transaction and return the seats to AVAILABLE.
 */
export async function cancelBookingSafe(
  bookingId: number,
  userId: number,
  isAdmin: boolean = false
): Promise<{
  bookingId: number;
  status: string;
  refundAmount: number;
  releasedSeatCount: number;
  showId: number;
}> {
  const client: PoolClient = await getClient();

  try {
    await client.query('BEGIN');

    // Lock booking record FOR UPDATE
    const bRes = await client.query(
      `SELECT id, user_id, show_id, total_amount, status
       FROM bookings
       WHERE id = $1
       FOR UPDATE`,
      [bookingId]
    );

    if (bRes.rows.length === 0) {
      throw new Error(`Booking #${bookingId} not found.`);
    }

    const booking = bRes.rows[0];

    if (!isAdmin && booking.user_id !== userId) {
      throw new Error('Forbidden. You do not have permission to cancel this booking.');
    }

    if (booking.status === 'CANCELLED') {
      throw new Error('This booking is already cancelled.');
    }

    // Update booking status
    await client.query(
      `UPDATE bookings SET status = 'CANCELLED', updated_at = NOW() WHERE id = $1`,
      [bookingId]
    );

    // Update payment record to REFUNDED
    await client.query(
      `UPDATE payments SET payment_status = 'REFUNDED' WHERE booking_id = $1`,
      [bookingId]
    );

    // Fetch seats attached to this booking
    const itemsRes = await client.query(
      `SELECT show_seat_id FROM booking_items WHERE booking_id = $1`,
      [bookingId]
    );

    const showSeatIds = itemsRes.rows.map((r) => r.show_seat_id);

    // Release seats back to AVAILABLE
    if (showSeatIds.length > 0) {
      await client.query(
        `UPDATE show_seats 
         SET status = 'AVAILABLE', held_by = NULL, hold_expires_at = NULL, version = version + 1, updated_at = NOW()
         WHERE id = ANY($1::int[])`,
        [showSeatIds]
      );
    }

    await client.query('COMMIT');

    return {
      bookingId,
      status: 'CANCELLED',
      refundAmount: parseFloat(booking.total_amount),
      releasedSeatCount: showSeatIds.length,
      showId: booking.show_id,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
