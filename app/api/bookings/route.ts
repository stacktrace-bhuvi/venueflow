import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireAuth, successResponse, errorResponse } from '@/lib/auth/middleware';
import { createBookingSafe } from '@/lib/services/booking';
import { query } from '@/lib/db/pg';

const createBookingSchema = z.object({
  showId: z.number().int().positive('Valid show ID is required'),
  seatIds: z.array(z.number().int().positive()).min(1, 'At least 1 seat must be selected'),
  paymentMethod: z.enum(['CREDIT_CARD', 'DEBIT_CARD', 'UPI', 'NET_BANKING']).default('CREDIT_CARD'),
});

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if ('errorResponse' in auth) {
    return auth.errorResponse;
  }

  const { user } = auth;

  try {
    const body = await req.json();
    const parseResult = createBookingSchema.safeParse(body);

    if (!parseResult.success) {
      return errorResponse('Validation failed', 'VALIDATION_ERROR', 400, parseResult.error.errors);
    }

    const { showId, seatIds, paymentMethod } = parseResult.data;

    // Execute atomic booking transaction with SELECT ... FOR UPDATE row locks
    const booking = await createBookingSafe({
      userId: user.userId,
      showId,
      seatIds,
      paymentMethod,
    });

    return successResponse(booking, 'Booking confirmed successfully', 201);
  } catch (err: any) {
    console.error('[Create Booking Error]:', err);

    if (
      err.message.includes('already booked') ||
      err.message.includes('temporarily held') ||
      err.message.includes('deadlock')
    ) {
      return errorResponse(err.message, 'SEATS_UNAVAILABLE', 409);
    }

    if (err.message.includes('past shows') || err.message.includes('cancelled')) {
      return errorResponse(err.message, 'INVALID_BOOKING_REQUEST', 400);
    }

    return errorResponse(err.message || 'Error processing booking', 'INTERNAL_SERVER_ERROR', 500);
  }
}

export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if ('errorResponse' in auth) {
    return auth.errorResponse;
  }

  const { user } = auth;

  try {
    const { searchParams } = new URL(req.url);
    const showIdFilter = searchParams.get('showId');

    const conditions: string[] = [];
    const values: any[] = [];
    let pIdx = 1;

    // Role check: Customers can ONLY see their own bookings; managers/admins can inspect all or by show
    if (user.role === 'customer') {
      conditions.push(`b.user_id = $${pIdx}`);
      values.push(user.userId);
      pIdx++;
    }

    if (showIdFilter) {
      conditions.push(`b.show_id = $${pIdx}`);
      values.push(parseInt(showIdFilter, 10));
      pIdx++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const sql = `
      SELECT 
        b.id,
        b.booking_reference,
        b.total_amount,
        b.status,
        b.created_at,
        b.user_id,
        u.full_name as customer_name,
        u.email as customer_email,
        s.id as show_id,
        s.start_time,
        e.title as event_title,
        v.name as venue_name,
        p.transaction_reference,
        p.payment_method,
        p.payment_status,
        (
          SELECT json_agg(json_build_object(
            'seatId', s2.id,
            'row', s2.row_label,
            'seatNumber', s2.seat_number,
            'section', vs.name,
            'pricePaid', bi.price_paid
          ))
          FROM booking_items bi
          JOIN show_seats ss ON bi.show_seat_id = ss.id
          JOIN seats s2 ON ss.seat_id = s2.id
          JOIN venue_sections vs ON s2.venue_section_id = vs.id
          WHERE bi.booking_id = b.id
        ) as items
      FROM bookings b
      JOIN users u ON b.user_id = u.id
      JOIN shows s ON b.show_id = s.id
      JOIN events e ON s.event_id = e.id
      JOIN venues v ON s.venue_id = v.id
      LEFT JOIN payments p ON b.id = p.booking_id
      ${whereClause}
      ORDER BY b.created_at DESC
    `;

    const res = await query(sql, values);

    return successResponse({
      bookings: res.rows.map((r) => ({
        id: r.id,
        bookingReference: r.booking_reference,
        totalAmount: parseFloat(r.total_amount),
        status: r.status,
        createdAt: r.created_at,
        customer: {
          id: r.user_id,
          name: r.customer_name,
          email: r.customer_email,
        },
        show: {
          id: r.show_id,
          startTime: r.start_time,
          eventTitle: r.event_title,
          venueName: r.venue_name,
        },
        payment: r.transaction_reference
          ? {
              transactionReference: r.transaction_reference,
              method: r.payment_method,
              status: r.payment_status,
            }
          : null,
        seats: r.items || [],
      })),
    });
  } catch (err: any) {
    console.error('[Get Bookings Error]:', err);
    return errorResponse(err.message || 'Error retrieving bookings', 'INTERNAL_SERVER_ERROR', 500);
  }
}
