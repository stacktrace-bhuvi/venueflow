import fs from 'fs';
import path from 'path';
import { pool } from '../lib/db/pg';
import { runAuthTests } from './auth.test';
import { runPricingTests } from './pricing.test';
import { runWaitlistTests } from './waitlist.test';
import { runConcurrentBookingTests } from './concurrent-booking.test';
import { runConstraintTests } from './constraints.test';

/**
 * Master Test Suite Runner for VenueFlow DBMS Level 3 Evaluation
 */

async function reseedDatabase() {
  const seedPath = path.join(process.cwd(), 'db/seed.sql');
  if (fs.existsSync(seedPath)) {
    const sql = fs.readFileSync(seedPath, 'utf8');
    if (sql.trim().length > 0) {
      await pool.query(sql);
    }
  }
}

async function main() {
  const startTime = Date.now();
  console.log('================================================================');
  console.log('        VENUEFLOW COMPREHENSIVE DBMS & BACKEND TEST SUITE       ');
  console.log('================================================================');

  // Reseed before running suites to guarantee initial clean state
  await reseedDatabase();

  const testResults: Array<{ name: string; passed: boolean; durationMs: number }> = [];

  const suites = [
    { name: 'Role-Based Access Control & Password Hashing', fn: runAuthTests },
    { name: 'Pessimistic Concurrency & Double-Booking Protection', fn: runConcurrentBookingTests },
    { name: 'Database-Level CHECK, UNIQUE & FK Constraints', fn: runConstraintTests },
    { name: 'Demand-Driven Dynamic Pricing & Clamp Boundaries', fn: runPricingTests },
    { name: 'Automated FIFO Waitlist Allocation & Cascade', fn: runWaitlistTests },
  ];

  for (const suite of suites) {
    const t0 = Date.now();
    try {
      const ok = await suite.fn();
      testResults.push({ name: suite.name, passed: ok, durationMs: Date.now() - t0 });
    } catch (err: any) {
      console.error(`\n❌ [TEST FAILURE]: ${suite.name}`);
      console.error(err.message || err);
      testResults.push({ name: suite.name, passed: false, durationMs: Date.now() - t0 });
    }
  }

  // Reseed after running suites to guarantee clean state for subsequent runs/viva demo
  try {
    await reseedDatabase();
  } catch (cleanErr) {
    console.warn('Post-test reseed warning:', cleanErr);
  } finally {
    await pool.end();
  }

  const totalDuration = Date.now() - startTime;
  const passedCount = testResults.filter((t) => t.passed).length;

  console.log('\n================================================================');
  console.log('                     TEST EXECUTION SUMMARY                     ');
  console.log('================================================================');
  for (const r of testResults) {
    const icon = r.passed ? '✓ PASSED' : '❌ FAILED';
    console.log(`[${icon}] ${r.name.padEnd(52)} (${r.durationMs}ms)`);
  }
  console.log('----------------------------------------------------------------');
  console.log(`Total Suites: ${testResults.length} | Passed: ${passedCount} | Failed: ${testResults.length - passedCount}`);
  console.log(`Total Execution Time: ${totalDuration}ms`);
  console.log('================================================================\n');

  if (passedCount !== testResults.length) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

main();
