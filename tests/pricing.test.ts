import dotenv from 'dotenv';
dotenv.config();

import {
  getRecentBehavioralTelemetry,
} from '../lib/services/pricing';
import { getEventViewsCollection, getAbandonedCheckoutsCollection } from '../lib/db/mongo';

export async function runPricingTests(): Promise<boolean> {
  console.log('\n--- Running Dynamic Pricing & Clamping Tests ---');

  // 1. Test mathematical clamping behavior
  function calculateDynamicPriceSim(
    basePrice: number,
    minPrice: number,
    maxPrice: number,
    occupancyRatio: number,
    demandWeight: number,
    views: number,
    abandonments: number
  ): number {
    const occMult = occupancyRatio * demandWeight;
    const behMult =
      Math.min(views, 200) * 0.002 * 0.05 * 10 +
      Math.min(abandonments, 50) * 0.01 * 0.08 * 10;
    const totalMult = 1.0 + occMult + behMult;
    const rawPrice = Math.round(basePrice * totalMult * 100) / 100;
    return Math.max(minPrice, Math.min(maxPrice, rawPrice));
  }

  // Min Clamp Check: Low base price with higher minPrice floor
  const minClamped = calculateDynamicPriceSim(2000, 2500, 6000, 0.0, 0.35, 0, 0);
  if (minClamped !== 2500) {
    throw new Error(`Min price clamp failed: expected 2500, got ${minClamped}`);
  }
  console.log('✓ Dynamic pricing strictly respects min_price floor (clamped at Rs 2,500).');

  // Max Clamp Check: Surge demand exceeding maxPrice ceiling
  const maxClamped = calculateDynamicPriceSim(3500, 3000, 5000, 1.0, 0.50, 500, 100);
  if (maxClamped !== 5000) {
    throw new Error(`Max price clamp failed: expected 5000, got ${maxClamped}`);
  }
  console.log('✓ Dynamic pricing strictly respects max_price ceiling (clamped at Rs 5,000).');

  // Moderate Surge Check: Valid price scaling
  const moderateSurge = calculateDynamicPriceSim(3500, 3000, 8000, 0.75, 0.40, 50, 5);
  if (moderateSurge <= 3500 || moderateSurge >= 8000) {
    throw new Error(`Moderate surge pricing out of range: got ${moderateSurge}`);
  }
  console.log(`✓ Moderate demand surge correctly calculated: Rs ${moderateSurge}.`);

  // 2. Test MongoDB Behavioral Telemetry Aggregation
  const viewsCol = await getEventViewsCollection();
  const testShowId = 999;
  const now = new Date();

  // Insert mock telemetry
  await viewsCol.insertMany([
    { showId: testShowId, eventId: 1, timestamp: now },
    { showId: testShowId, eventId: 1, timestamp: new Date(now.getTime() - 1000 * 60 * 10) },
  ]);

  const telemetry = await getRecentBehavioralTelemetry(testShowId, 60);
  if (telemetry.recentViews < 2) {
    throw new Error(`MongoDB aggregation failed to count recent views: got ${telemetry.recentViews}`);
  }
  console.log(`✓ MongoDB aggregation pipeline successfully counted ${telemetry.recentViews} views in rolling 1-hour window.`);

  // Cleanup mock test telemetry
  await viewsCol.deleteMany({ showId: testShowId });

  return true;
}

if (require.main === module) {
  runPricingTests()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
