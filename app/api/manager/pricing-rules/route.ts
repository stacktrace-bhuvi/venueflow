import { NextRequest } from 'next/server';
import { requireRole, successResponse, errorResponse } from '@/lib/auth/middleware';
import { query } from '@/lib/db/pg';

/**
 * GET /api/manager/pricing-rules
 *
 * Lists every show the caller manages together with its pricing rule.
 *
 * Added because PATCH /api/manager/pricing-rules/:id takes the pricing RULE id,
 * but no existing endpoint exposed it — so the rule was unreachable from the
 * browser. Read-only and scoped exactly like the other manager endpoints:
 * a manager sees only shows at venues they manage, an admin sees all.
 */
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = requireRole(req, ['manager', 'admin']);
  if ('errorResponse' in auth) {
    return auth.errorResponse;
  }

  const { user } = auth;

  try {
    const isManager = user.role === 'manager';
    const whereSql = isManager ? 'WHERE v.manager_id = $1' : '';
    const values = isManager ? [user.userId] : [];

    const res = await query(
      `SELECT
         s.id            AS show_id,
         s.start_time,
         s.base_price,
         s.status,
         e.title         AS event_title,
         v.id            AS venue_id,
         v.name          AS venue_name,
         pr.id           AS pricing_rule_id,
         pr.min_price,
         pr.max_price,
         pr.demand_factor_weight,
         pr.view_weight,
         pr.search_weight,
         pr.abandon_weight
       FROM shows s
       JOIN events e ON s.event_id = e.id
       JOIN venues v ON s.venue_id = v.id
       LEFT JOIN pricing_rules pr ON s.id = pr.show_id
       ${whereSql}
       ORDER BY s.start_time ASC`,
      values
    );

    return successResponse({
      shows: res.rows.map((r) => ({
        showId: r.show_id,
        eventTitle: r.event_title,
        venueId: r.venue_id,
        venueName: r.venue_name,
        startTime: r.start_time,
        basePrice: parseFloat(r.base_price),
        status: r.status,
        pricingRuleId: r.pricing_rule_id,
        minPrice: r.min_price !== null ? parseFloat(r.min_price) : null,
        maxPrice: r.max_price !== null ? parseFloat(r.max_price) : null,
        demandFactorWeight: r.demand_factor_weight !== null ? parseFloat(r.demand_factor_weight) : null,
        viewWeight: r.view_weight !== null ? parseFloat(r.view_weight) : null,
        searchWeight: r.search_weight !== null ? parseFloat(r.search_weight) : null,
        abandonWeight: r.abandon_weight !== null ? parseFloat(r.abandon_weight) : null,
      })),
    });
  } catch (err: any) {
    console.error('[List Pricing Rules Error]:', err);
    return errorResponse(err.message || 'Error fetching pricing rules', 'INTERNAL_SERVER_ERROR', 500);
  }
}
