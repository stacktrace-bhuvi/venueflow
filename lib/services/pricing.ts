/**
 * Dynamic Pricing Service
 * Aggregates behavioral telemetry from MongoDB (views, searches, abandoned checkouts in rolling windows)
 * and invokes PostgreSQL stored function calculate_dynamic_price() clamped to pricing rules.
 */

export interface PricingBreakdown {
  showId: number;
  basePrice: number;
  currentPrice: number;
  occupancyMultiplier: number;
  behavioralDemandMultiplier: number;
  minPrice: number;
  maxPrice: number;
}
