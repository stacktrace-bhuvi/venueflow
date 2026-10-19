import { NextRequest } from 'next/server';
import { query } from '@/lib/db/pg';
import { successResponse, errorResponse } from '@/lib/auth/middleware';
import { computeDynamicPrice } from '@/lib/services/pricing';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const showId = parseInt(params.id, 10);
    if (isNaN(showId)) {
      return errorResponse('Invalid show ID parameter', 'BAD_REQUEST', 400);
    }

    // Step 1: Automatically release expired holds for this show
    await query(
      `UPDATE show_seats 
       SET status = 'AVAILABLE', held_by = NULL, hold_expires_at = NULL, updated_at = NOW()
       WHERE show_id = $1 
         AND status = 'HELD' 
         AND hold_expires_at < NOW()`,
      [showId]
    );

    // Step 2: Fetch show details, pricing rules, and venue
    const showRes = await query(
      `SELECT 
         s.id, s.start_time, s.end_time, s.base_price, s.status,
         e.id as event_id, e.title as event_title,
         v.id as venue_id, v.name as venue_name,
         pr.min_price, pr.max_price, pr.demand_factor_weight
       FROM shows s
       JOIN events e ON s.event_id = e.id
       JOIN venues v ON s.venue_id = v.id
       LEFT JOIN pricing_rules pr ON s.id = pr.show_id
       WHERE s.id = $1`,
      [showId]
    );

    if (showRes.rows.length === 0) {
      return errorResponse('Show not found', 'NOT_FOUND', 404);
    }

    const show = showRes.rows[0];

    // Step 3: Fetch all seat instances for this show
    const seatsRes = await query(
      `SELECT 
         ss.id as show_seat_id,
         ss.seat_id,
         ss.status,
         ss.held_by,
         ss.hold_expires_at,
         s.row_label,
         s.seat_number,
         s.is_accessible,
         vs.id as section_id,
         vs.name as section_name,
         vs.base_multiplier
       FROM show_seats ss
       JOIN seats s ON ss.seat_id = s.id
       JOIN venue_sections vs ON s.venue_section_id = vs.id
       WHERE ss.show_id = $1
       ORDER BY vs.id ASC, s.row_label ASC, s.seat_number ASC`,
      [showId]
    );

    const seats = seatsRes.rows;
    const totalSeats = seats.length;
    const bookedCount = seats.filter((s) => s.status === 'BOOKED').length;
    const heldCount = seats.filter((s) => s.status === 'HELD').length;
    const availableCount = seats.filter((s) => s.status === 'AVAILABLE').length;

    const occupancyRate = totalSeats > 0 ? (bookedCount + heldCount) / totalSeats : 0;
    const basePrice = parseFloat(show.base_price);

    // Invoke Dynamic Pricing Engine (MongoDB Telemetry + calculate_dynamic_price PL/pgSQL function)
    const pricingResult = await computeDynamicPrice(showId);
    const dynamicPrice = pricingResult.calculatedPrice;
    const minPrice = pricingResult.minPrice;
    const maxPrice = pricingResult.maxPrice;

    return successResponse({
      showId: show.id,
      eventTitle: show.event_title,
      venueName: show.venue_name,
      startTime: show.start_time,
      endTime: show.end_time,
      status: show.status,
      pricing: {
        basePrice,
        currentDynamicPrice: dynamicPrice,
        minPrice,
        maxPrice,
        occupancyRate: Math.round(occupancyRate * 100) / 100,
        demandTier: occupancyRate > 0.8 ? 'VERY_HIGH' : occupancyRate > 0.5 ? 'HIGH' : 'NORMAL',
      },
      stats: {
        totalSeats,
        availableSeats: availableCount,
        heldSeats: heldCount,
        bookedSeats: bookedCount,
      },
      seats: seats.map((s) => {
        const mult = parseFloat(s.base_multiplier) || 1.0;
        const seatPrice = Math.round(dynamicPrice * mult * 100) / 100;

        return {
          showSeatId: s.show_seat_id,
          seatId: s.seat_id,
          sectionId: s.section_id,
          section: s.section_name,
          rowNumber: s.row_label,
          seatNumber: s.seat_number,
          isAccessible: s.is_accessible,
          status: s.status,
          holdExpiresAt: s.hold_expires_at,
          price: seatPrice,
        };
      }),
    });
  } catch (err: any) {
    console.error('[Show Seats Error]:', err);
    return errorResponse(err.message || 'Error fetching show seats', 'INTERNAL_SERVER_ERROR', 500);
  }
}
