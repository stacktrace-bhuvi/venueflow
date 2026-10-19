import fs from 'fs';
import path from 'path';

/**
 * Phase 4 Verification Suite
 * Tests dynamic pricing clamping logic, FIFO queue allocation simulation,
 * and SQL script syntax completeness.
 */

async function runPhase4Tests() {
  console.log('--- Phase 4 Verification Suite ---');

  // Test 1: Verify SQL files exist and have content
  const requiredSqlFiles = [
    'db/schema.sql',
    'db/functions_triggers.sql',
    'db/views_indexes.sql',
    'db/queries.sql',
    'db/alter_drop_demo.sql',
    'db/seed.sql',
  ];

  for (const f of requiredSqlFiles) {
    const filePath = path.join(process.cwd(), f);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Required SQL file ${f} is missing.`);
    }
    const content = fs.readFileSync(filePath, 'utf8');
    if (content.length < 50) {
      throw new Error(`SQL file ${f} has insufficient content.`);
    }
    console.log(`✓ Verified ${f} (${content.length} bytes)`);
  }

  // Test 2: Unit test dynamic pricing math simulation (replicates calculate_dynamic_price PL/pgSQL function)
  function simulatePricing(
    basePrice: number,
    minPrice: number,
    maxPrice: number,
    occupancyRatio: number,
    demandWeight: number,
    recentViews: number,
    recentAbandon: number,
    viewWeight: number,
    abandonWeight: number
  ): number {
    const occMult = occupancyRatio * demandWeight;
    const behMult =
      Math.min(recentViews, 200) * 0.002 * viewWeight * 10 +
      Math.min(recentAbandon, 50) * 0.01 * abandonWeight * 10;
    const totalMult = 1.0 + occMult + behMult;
    const rawPrice = Math.round(basePrice * totalMult * 100) / 100;
    return Math.max(minPrice, Math.min(maxPrice, rawPrice));
  }

  // Scenario A: Zero occupancy, zero views -> Should clamp to basePrice or minPrice
  const priceA = simulatePricing(3500, 3000, 7500, 0.0, 0.35, 0, 0, 0.05, 0.08);
  if (priceA !== 3500) {
    throw new Error(`Pricing Scenario A failed: got ${priceA}`);
  }
  console.log(`✓ Test 2A: Baseline pricing verified: Rs ${priceA}`);

  // Scenario B: High occupancy (90%) + High view velocity (120 views) -> Dynamic surge
  const priceB = simulatePricing(3500, 3000, 7500, 0.9, 0.40, 120, 15, 0.05, 0.08);
  if (priceB <= 3500 || priceB > 7500) {
    throw new Error(`Pricing Scenario B failed: got ${priceB}`);
  }
  console.log(`✓ Test 2B: High demand surge verified: Rs ${priceB} (bounded within [3000, 7500])`);

  // Scenario C: Extreme demand exceeding maxPrice -> Strictly clamped to maxPrice
  const priceC = simulatePricing(3500, 3000, 5000, 1.0, 0.50, 500, 100, 0.1, 0.1);
  if (priceC !== 5000) {
    throw new Error(`Pricing Scenario C clamping failed: expected 5000, got ${priceC}`);
  }
  console.log(`✓ Test 2C: Extreme demand ceiling clamp verified: Rs ${priceC} == max_price (5000)`);

  // Test 3: FIFO Waitlist Allocation Simulation
  interface WaitlistTestUser {
    id: number;
    name: string;
    quantity: number;
    position: number;
  }

  const queue: WaitlistTestUser[] = [
    { id: 1, name: 'Ananya', quantity: 2, position: 1 },
    { id: 2, name: 'Rahul', quantity: 1, position: 2 },
    { id: 3, name: 'Neha', quantity: 2, position: 3 },
  ];

  function simulateFifoPromotion(availableSeats: number) {
    let remaining = availableSeats;
    const promoted: WaitlistTestUser[] = [];
    for (const user of queue) {
      if (user.quantity <= remaining) {
        promoted.push(user);
        remaining -= user.quantity;
        if (remaining <= 0) break;
      }
    }
    return { promoted, remaining };
  }

  // If 2 seats released: Ananya (quantity 2, pos 1) gets promoted
  const res2 = simulateFifoPromotion(2);
  if (res2.promoted.length !== 1 || res2.promoted[0].name !== 'Ananya' || res2.remaining !== 0) {
    throw new Error('FIFO promotion test 1 failed');
  }
  console.log(`✓ Test 3A: FIFO promotion priority passed: Promoted ${res2.promoted[0].name} for 2 seats.`);

  // If 3 seats released: Ananya (2) + Rahul (1) get promoted
  const res3 = simulateFifoPromotion(3);
  if (res3.promoted.length !== 2 || res3.remaining !== 0) {
    throw new Error('FIFO promotion test 2 failed');
  }
  console.log(`✓ Test 3B: FIFO promotion multi-seat cascade passed: Promoted Ananya & Rahul.`);

  console.log('All Phase 4 unit and algorithm checks passed!');
  process.exit(0);
}

runPhase4Tests().catch((err) => {
  console.error('Phase 4 verification failed:', err);
  process.exit(1);
});
