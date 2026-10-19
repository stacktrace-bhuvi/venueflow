/**
 * Waitlist Service
 * Handles FIFO queue management, requested quantity fulfillment,
 * time-limited promotion holds, and cancellation-triggered cascade.
 */

export interface WaitlistEntry {
  id: number;
  showId: number;
  userId: number;
  requestedQuantity: number;
  position: number;
  status: 'WAITING' | 'PROMOTED' | 'EXPIRED' | 'CANCELLED';
  promotedUntil?: Date | null;
  createdAt: Date;
}
