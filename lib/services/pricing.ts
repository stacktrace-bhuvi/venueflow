import { getEventViewsCollection, getAbandonedCheckoutsCollection } from '../db/mongo';
import { query } from '../db/pg';

/**
 * Dynamic Pricing Service for VenueFlow.
 * 
 * Aggregates behavioral telemetry from MongoDB (event views and abandoned checkouts
 * in rolling time windows) and invokes the PostgreSQL stored function
 * calculate_dynamic_price() to execute occupancy-aware pricing adjustments clamped
 * to pricing rule boundaries.
 */

export interface DynamicPriceResult {
  showId: number;
  basePrice: number;
  calculatedPrice: number;
  minPrice: number;
  maxPrice: number;
  telemetry: {
    viewsPastHour: number;
    abandonmentsPastHour: number;
  };
}

/**
 * Aggregate behavioral telemetry from MongoDB for a specific show within a time window.
 */
export async function getRecentBehavioralTelemetry(
  showId: number,
  windowMinutes: number = 60
): Promise<{ recentViews: number; recentAbandonments: number }> {
  try {
    const cutoff = new Date(Date.now() - windowMinutes * 60 * 1000);

    const viewsCol = await getEventViewsCollection();
    const abandonCol = await getAbandonedCheckoutsCollection();

    // MongoDB Aggregation Pipeline 1: Count recent show page views
    const viewsAgg = await viewsCol
      .aggregate([
        { $match: { showId, timestamp: { $gte: cutoff } } },
        { $group: { _id: '$showId', count: { $sum: 1 } } },
      ])
      .toArray();

    // MongoDB Aggregation Pipeline 2: Count recent abandoned checkout steps
    const abandonAgg = await abandonCol
      .aggregate([
        { $match: { showId, timestamp: { $gte: cutoff } } },
        { $group: { _id: '$showId', count: { $sum: 1 } } },
      ])
      .toArray();

    const recentViews = viewsAgg.length > 0 ? viewsAgg[0].count : 0;
    const recentAbandonments = abandonAgg.length > 0 ? abandonAgg[0].count : 0;

    return { recentViews, recentAbandonments };
  } catch (err) {
    console.warn('[MongoDB Telemetry Aggregation Fallback]:', err);
    return { recentViews: 0, recentAbandonments: 0 };
  }
}

/**
 * Compute and persist dynamic price using MongoDB telemetry + PostgreSQL stored function.
 */
export async function computeDynamicPrice(showId: number): Promise<DynamicPriceResult> {
  // 1. Fetch real-time behavioral telemetry from MongoDB
  const { recentViews, recentAbandonments } = await getRecentBehavioralTelemetry(showId, 60);

  // 2. Invoke PostgreSQL stored function
  const fnRes = await query(
    `SELECT calculate_dynamic_price($1, $2, $3) as dynamic_price`,
    [showId, recentViews, recentAbandonments]
  );

  const dynamicPrice = parseFloat(fnRes.rows[0].dynamic_price);

  // 3. Fetch show & pricing bounds for complete breakdown
  const showRes = await query(
    `SELECT s.base_price, pr.min_price, pr.max_price
     FROM shows s
     LEFT JOIN pricing_rules pr ON s.id = pr.show_id
     WHERE s.id = $1`,
    [showId]
  );

  const show = showRes.rows[0];

  return {
    showId,
    basePrice: parseFloat(show.base_price),
    calculatedPrice: dynamicPrice,
    minPrice: show.min_price ? parseFloat(show.min_price) : parseFloat(show.base_price) * 0.8,
    maxPrice: show.max_price ? parseFloat(show.max_price) : parseFloat(show.base_price) * 2.5,
    telemetry: {
      viewsPastHour: recentViews,
      abandonmentsPastHour: recentAbandonments,
    },
  };
}
