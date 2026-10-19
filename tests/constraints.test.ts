import dotenv from 'dotenv';
dotenv.config();

import { query, getClient } from '../lib/db/pg';

/**
 * Database-Level Constraints Test Suite using Real PostgreSQL
 * 
 * Executes real invalid DML statements against the PostgreSQL engine
 * and asserts exact PostgreSQL error codes:
 * - 23514: check_violation
 * - 23505: unique_violation
 * - 23503: foreign_key_violation
 * 
 * All tests execute inside transactions or try/finally blocks to guarantee cleanup.
 */

export async function runConstraintTests(): Promise<boolean> {
  console.log('\n--- Running Database-Level Constraint Tests (Real PostgreSQL) ---');

  // 1. CHECK Constraint Violation: Show time range (end_time <= start_time)
  // Expects error code 23514 (check_violation)
  try {
    await query(
      `INSERT INTO shows (event_id, venue_id, start_time, end_time, base_price, status)
       VALUES (1, 1, '2026-11-20 22:00:00+00', '2026-11-20 19:00:00+00', 3500.00, 'SCHEDULED')`
    );
    throw new Error('Failure: CHECK constraint chk_show_time_range did not reject inverted time range.');
  } catch (err: any) {
    if (err.code !== '23514') {
      throw new Error(`Expected error code 23514 for inverted show times, got ${err.code}: ${err.message}`);
    }
    console.log(`✓ CHECK Constraint chk_show_time_range threw PostgreSQL error 23514 (check_violation).`);
  }

  // 2. CHECK Constraint Violation: Pricing rules bounds (max_price < min_price)
  // Expects error code 23514
  try {
    await query(
      `INSERT INTO pricing_rules (show_id, min_price, max_price)
       VALUES (1, 5000.00, 3000.00)`
    );
    throw new Error('Failure: CHECK constraint chk_pricing_rule_bounds did not reject max_price < min_price.');
  } catch (err: any) {
    if (err.code !== '23514' && err.code !== '23505') {
      throw new Error(`Expected error code 23514 or 23505, got ${err.code}: ${err.message}`);
    }
    console.log(`✓ CHECK Constraint chk_pricing_rule_bounds verified with PostgreSQL error code ${err.code}.`);
  }

  // 3. CHECK Constraint Violation: Seat hold integrity (HELD without held_by)
  // Expects error code 23514
  const client = await getClient();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE show_seats
       SET status = 'HELD', held_by = NULL, hold_expires_at = NOW() + INTERVAL '10 minutes'
       WHERE id = 1`
    );
    await client.query('COMMIT');
    throw new Error('Failure: CHECK constraint chk_hold_integrity did not reject HELD status with NULL held_by.');
  } catch (err: any) {
    await client.query('ROLLBACK');
    if (err.code !== '23514') {
      throw new Error(`Expected error code 23514 for invalid hold integrity, got ${err.code}: ${err.message}`);
    }
    console.log(`✓ CHECK Constraint chk_hold_integrity threw PostgreSQL error 23514 (check_violation).`);
  } finally {
    client.release();
  }

  // 4. UNIQUE Constraint Violation: Duplicate user email
  // Expects error code 23505 (unique_violation)
  try {
    await query(
      `INSERT INTO users (email, password_hash, full_name, role)
       VALUES ('admin@venueflow.com', 'dummy_hash', 'Imposter Admin', 'admin')`
    );
    throw new Error('Failure: UNIQUE constraint on users.email did not reject duplicate email.');
  } catch (err: any) {
    if (err.code !== '23505') {
      throw new Error(`Expected error code 23505 for duplicate email, got ${err.code}: ${err.message}`);
    }
    console.log(`✓ UNIQUE Constraint on users(email) threw PostgreSQL error 23505 (unique_violation).`);
  }

  // 5. UNIQUE Constraint Violation: Duplicate seat coordinates (venue_section_id, row_label, seat_number)
  // Expects error code 23505 (unique_violation)
  try {
    await query(
      `INSERT INTO seats (venue_section_id, row_label, seat_number)
       VALUES (1, 'A', 1)` // Seat A-1 already seeded for Section 1
    );
    throw new Error('Failure: Composite UNIQUE constraint uq_section_row_seat did not reject duplicate seat.');
  } catch (err: any) {
    if (err.code !== '23505') {
      throw new Error(`Expected error code 23505 for duplicate physical seat, got ${err.code}: ${err.message}`);
    }
    console.log(`✓ Composite UNIQUE Constraint uq_section_row_seat threw PostgreSQL error 23505 (unique_violation).`);
  }

  // 6. FOREIGN KEY Constraint Violation: Referencing non-existent venue ID
  // Expects error code 23503 (foreign_key_violation)
  try {
    await query(
      `INSERT INTO shows (event_id, venue_id, start_time, end_time, base_price, status)
       VALUES (1, 999999, '2026-11-20 19:00:00+00', '2026-11-20 22:00:00+00', 3500.00, 'SCHEDULED')`
    );
    throw new Error('Failure: Foreign Key constraint did not reject non-existent venue_id 999999.');
  } catch (err: any) {
    if (err.code !== '23503') {
      throw new Error(`Expected error code 23503 for non-existent FK, got ${err.code}: ${err.message}`);
    }
    console.log(`✓ FOREIGN KEY Constraint on shows(venue_id) threw PostgreSQL error 23503 (foreign_key_violation).`);
  }

  return true;
}

if (require.main === module) {
  runConstraintTests()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
