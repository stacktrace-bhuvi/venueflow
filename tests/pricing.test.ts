import dotenv from 'dotenv';
dotenv.config();

import { computeDynamicPrice } from '../lib/services/pricing';
import { query } from '../lib/db/pg';
import { getEventViewsCollection } from '../lib/db/mongo';

/**
 * Dynamic Pricing Test Suite using Real PostgreSQL & MongoDB
 * 
 * Verifies:
 * 1. computeDynamicPrice() integrates MongoDB aggregation with PostgreSQL calculate_dynamic_price()
 * 2. Mathematical clamping to [min_price, max_price]
 * 3. Audit logging in PostgreSQL price_history table
 */

export async function runPricingTests(): Promise<boolean> {
  console.log('\n--- Running Dynamic Pricing & Clamping Tests (Real PG + Mongo) ---');

  const showId = 1;

  // 1. Fetch configured bounds from pricing_rules in PostgreSQL
  const ruleRes = await query(
    `SELECT s.base_price, pr.min_price, pr.max_price 
     FROM shows s
     JOIN pricing_rules pr ON s.id = pr.show_id
     WHERE s.id = $1`,
    [showId]
  );

  if (ruleRes.rows.length === 0) {
    throw new Error('Test setup error: Pricing rules not found for Show 1.');
  }

  const basePrice = parseFloat(ruleRes.rows[0].base_price);
  const minPrice = parseFloat(ruleRes.rows[0].min_price);
  const maxPrice = parseFloat(ruleRes.rows[0].max_price);

  console.log(`Show #1 Baseline: Base=Rs ${basePrice}, Min=Rs ${minPrice}, Max=Rs ${maxPrice}`);

  // 2. Insert temporary view telemetry into real MongoDB to simulate demand
  const viewsCol = await getEventViewsCollection();
  const testViewDocs = Array.from({ length: 15 }).map(() => ({
    showId,
    eventId: 1,
    source: 'pricing_test',
    timestamp: new Date(),
  }));
  await viewsCol.insertMany(testViewDocs);

  try {
    // 3. Execute computeDynamicPrice (MongoDB Aggregation + PostgreSQL stored function)
    const result = await computeDynamicPrice(showId);

    console.log(`✓ Computed Dynamic Price: Rs ${result.calculatedPrice}`);
    console.log(`✓ MongoDB Telemetry Captured: ${result.telemetry.viewsPastHour} views past hour`);

    // Invariant: Must be strictly between minPrice and maxPrice
    if (result.calculatedPrice < minPrice || result.calculatedPrice > maxPrice) {
      throw new Error(
        `Dynamic price out of bounds! Expected [${minPrice}, ${maxPrice}], got ${result.calculatedPrice}`
      );
    }
    console.log('✓ Dynamic price strictly clamped within [min_price, max_price] bounds.');

    // 4. Test Extreme Surge Clamping directly in PostgreSQL
    const extremeRes = await query(
      `SELECT calculate_dynamic_price($1, 500, 100) as surge_price`,
      [showId]
    );
    const surgePrice = parseFloat(extremeRes.rows[0].surge_price);

    if (surgePrice !== maxPrice) {
      throw new Error(`Extreme surge clamping failed: Expected max_price ${maxPrice}, got ${surgePrice}`);
    }
    console.log(`✓ Extreme demand surge ceiling clamp verified: Rs ${surgePrice} == max_price (${maxPrice}).`);

    // 5. Verify Price History Audit Ledger in PostgreSQL
    const historyRes = await query(
      `SELECT old_price, new_price, reason, recorded_at 
       FROM price_history 
       WHERE show_id = $1 
       ORDER BY recorded_at DESC 
       LIMIT 1`,
      [showId]
    );

    if (historyRes.rows.length === 0) {
      throw new Error('Failure: Price change was not recorded in PostgreSQL price_history table.');
    }

    const latestAudit = historyRes.rows[0];
    console.log(`✓ Verified in PostgreSQL price_history: New Price=Rs ${latestAudit.new_price}, Reason="${latestAudit.reason}"`);

    return true;
  } finally {
    // Clean up temporary telemetry from MongoDB
    await viewsCol.deleteMany({ showId, source: 'pricing_test' });
  }
}

if (require.main === module) {
  runPricingTests()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
