import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireRole, successResponse, errorResponse } from '@/lib/auth/middleware';
import { query } from '@/lib/db/pg';

const updatePricingRuleSchema = z.object({
  minPrice: z.number().positive().optional(),
  maxPrice: z.number().positive().optional(),
  demandFactorWeight: z.number().min(0).optional(),
  viewWeight: z.number().min(0).optional(),
  searchWeight: z.number().min(0).optional(),
  abandonWeight: z.number().min(0).optional(),
});

export const dynamic = 'force-dynamic';

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = requireRole(req, ['manager', 'admin']);
  if ('errorResponse' in auth) {
    return auth.errorResponse;
  }

  const { user } = auth;
  const ruleId = parseInt(params.id, 10);

  if (isNaN(ruleId)) {
    return errorResponse('Invalid pricing rule ID', 'BAD_REQUEST', 400);
  }

  try {
    const body = await req.json();
    const parseResult = updatePricingRuleSchema.safeParse(body);

    if (!parseResult.success) {
      return errorResponse('Validation failed', 'VALIDATION_ERROR', 400, parseResult.error.errors);
    }

    const updates = parseResult.data;

    // Check ownership
    const ruleRes = await query(
      `SELECT pr.id, pr.min_price, pr.max_price, v.manager_id
       FROM pricing_rules pr
       JOIN shows s ON pr.show_id = s.id
       JOIN venues v ON s.venue_id = v.id
       WHERE pr.id = $1`,
      [ruleId]
    );

    if (ruleRes.rows.length === 0) {
      return errorResponse('Pricing rule not found', 'NOT_FOUND', 404);
    }

    const currentRule = ruleRes.rows[0];

    if (user.role === 'manager' && currentRule.manager_id !== user.userId) {
      return errorResponse('Forbidden. You do not manage the venue for this show.', 'FORBIDDEN', 403);
    }

    const finalMin = updates.minPrice ?? parseFloat(currentRule.min_price);
    const finalMax = updates.maxPrice ?? parseFloat(currentRule.max_price);

    if (finalMax < finalMin) {
      return errorResponse('Max price cannot be less than min price', 'INVALID_BOUNDS', 400);
    }

    const updateFields: string[] = ['updated_at = NOW()'];
    const values: any[] = [ruleId];
    let pIdx = 2;

    if (updates.minPrice !== undefined) {
      updateFields.push(`min_price = $${pIdx}`);
      values.push(updates.minPrice);
      pIdx++;
    }

    if (updates.maxPrice !== undefined) {
      updateFields.push(`max_price = $${pIdx}`);
      values.push(updates.maxPrice);
      pIdx++;
    }

    if (updates.demandFactorWeight !== undefined) {
      updateFields.push(`demand_factor_weight = $${pIdx}`);
      values.push(updates.demandFactorWeight);
      pIdx++;
    }

    if (updates.viewWeight !== undefined) {
      updateFields.push(`view_weight = $${pIdx}`);
      values.push(updates.viewWeight);
      pIdx++;
    }

    if (updates.searchWeight !== undefined) {
      updateFields.push(`search_weight = $${pIdx}`);
      values.push(updates.searchWeight);
      pIdx++;
    }

    if (updates.abandonWeight !== undefined) {
      updateFields.push(`abandon_weight = $${pIdx}`);
      values.push(updates.abandonWeight);
      pIdx++;
    }

    const updateSql = `
      UPDATE pricing_rules
      SET ${updateFields.join(', ')}
      WHERE id = $1
      RETURNING id, show_id, min_price, max_price, demand_factor_weight, view_weight, search_weight, abandon_weight, updated_at
    `;

    const res = await query(updateSql, values);

    return successResponse(res.rows[0], 'Pricing rule updated successfully');
  } catch (err: any) {
    console.error('[Update Pricing Rule Error]:', err);
    return errorResponse(err.message || 'Error updating pricing rule', 'INTERNAL_SERVER_ERROR', 500);
  }
}
