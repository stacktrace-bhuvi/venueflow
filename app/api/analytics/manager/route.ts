import { NextRequest } from 'next/server';
import { requireRole, successResponse, errorResponse } from '@/lib/auth/middleware';
import { query } from '@/lib/db/pg';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = requireRole(req, ['manager', 'admin']);
  if ('errorResponse' in auth) {
    return auth.errorResponse;
  }

  const { user } = auth;

  try {
    const isManager = user.role === 'manager';
    const filterSql = isManager ? 'WHERE manager_id = $1' : '';
    const filterParams = isManager ? [user.userId] : [];

    // Query Manager Dashboard View
    const dashboardRes = await query(
      `SELECT * FROM manager_dashboard_view ${filterSql}`,
      filterParams
    );

    // Query Show Occupancy View for Manager's Venues
    const occupancySql = isManager
      ? `SELECT sov.* 
         FROM show_occupancy_view sov
         JOIN venues v ON sov.venue_id = v.id
         WHERE v.manager_id = $1
         ORDER BY sov.start_time ASC
         LIMIT 20`
      : `SELECT * FROM show_occupancy_view ORDER BY start_time ASC LIMIT 20`;

    const occupancyRes = await query(occupancySql, filterParams);

    return successResponse({
      venuesSummary: dashboardRes.rows.map((row) => ({
        venueId: row.venue_id,
        venueName: row.venue_name,
        city: row.venue_city,
        managerName: row.manager_name,
        totalShows: parseInt(row.total_shows || '0', 10),
        confirmedBookings: parseInt(row.total_confirmed_bookings || '0', 10),
        totalTicketRevenue: parseFloat(row.total_ticket_revenue || '0.00'),
        averageOccupancyPct: parseFloat(row.average_show_occupancy_pct || '0.00'),
        waitingCustomersCount: parseInt(row.active_waiting_customers || '0', 10),
      })),
      showsOccupancy: occupancyRes.rows.map((row) => ({
        showId: row.show_id,
        eventTitle: row.event_title,
        venueName: row.venue_name,
        startTime: row.start_time,
        basePrice: parseFloat(row.base_price),
        status: row.show_status,
        totalCapacity: parseInt(row.total_capacity || '0', 10),
        availableSeats: parseInt(row.available_seats || '0', 10),
        bookedSeats: parseInt(row.booked_seats || '0', 10),
        heldSeats: parseInt(row.held_seats || '0', 10),
        occupancyPercentage: parseFloat(row.occupancy_percentage || '0.00'),
      })),
    });
  } catch (err: any) {
    console.error('[Manager Analytics Error]:', err);
    return errorResponse(err.message || 'Error fetching manager analytics', 'INTERNAL_SERVER_ERROR', 500);
  }
}
