import { PoolClient } from 'pg';

/**
 * Booking Service
 * Handles transactional seat locking (SELECT ... FOR UPDATE),
 * hold reservation, expiration cleanup, and booking confirmations.
 */

export interface CreateBookingParams {
  userId: number;
  showId: number;
  seatIds: number[];
  paymentMethod?: string;
}

export interface BookingResult {
  bookingId: number;
  bookingReference: string;
  totalAmount: number;
  status: 'CONFIRMED' | 'PENDING' | 'CANCELLED';
  seatCount: number;
}
