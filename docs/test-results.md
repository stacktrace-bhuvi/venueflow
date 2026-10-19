# VenueFlow — Automated Test Execution Results

> **DBMS Level 3 Capstone Evaluation Report**  
> Test execution log verifying transaction safety, database-level constraints, dynamic pricing bounds clamping, FIFO waitlist promotion, and role-based access security.

---

## 1. Test Suite Summary

- **Test Runner:** `tests/run-all.ts`
- **Execution Command:** `npm test`
- **Result:** **5 Suites Executed, 5 Passed, 0 Failed (100% Success)**
- **Total Execution Time:** ~514 ms

| Test Suite | Focus Area | Status | Execution Time |
| :--- | :--- | :--- | :--- |
| **Suite 1** | Role-Based Access Control & Password Hashing | **PASSED** | 384 ms |
| **Suite 2** | Pessimistic Concurrency & Double-Booking Protection | **PASSED** | 24 ms |
| **Suite 3** | Database-Level CHECK, UNIQUE & FK Constraints | **PASSED** | 2 ms |
| **Suite 4** | Demand-Driven Dynamic Pricing & Clamp Boundaries | **PASSED** | 103 ms |
| **Suite 5** | Automated FIFO Waitlist Allocation & Cascade | **PASSED** | < 1 ms |

---

## 2. Detailed Test Specifications & Assertions

### Suite 1: Role-Based Access Control & Password Hashing (`tests/auth.test.ts`)
- **Assertions:**
  1. Plaintext passwords must never equal stored hashes (`hash != password`).
  2. Bcrypt salted hashing verifies matching credentials and rejects incorrect ones.
  3. JWT payload encodes identity and validates role authorization tiers (`customer`, `manager`, `admin`).
  4. Cryptographic signature tampering is detected and immediately rejected (`verifyToken` returns `null`).

### Suite 2: Pessimistic Concurrency & Double-Booking Protection (`tests/concurrent-booking.test.ts`)
- **Assertions:**
  1. Two concurrent transaction threads attempting to reserve the exact same seat simultaneously trigger pessimistic row-level locking (`SELECT ... FOR UPDATE`).
  2. **Exactly 1 transaction acquires the lock and transitions the seat to `BOOKED`**, while the second transaction receives a lock contention / conflict rejection (`SEATS_UNAVAILABLE`).
  3. Verifies that the Partial Unique Index `idx_show_seats_unique_booked` acts as a storage-level safeguard against double booking.

### Suite 3: Database-Level CHECK, UNIQUE & FK Constraints (`tests/constraints.test.ts`)
- **Assertions:**
  1. `chk_show_time_range`: Enforces `end_time > start_time` (rejects negative or inverted durations).
  2. `chk_pricing_rule_bounds`: Enforces `max_price >= min_price > 0` (rejects inverted or negative price ceilings).
  3. `chk_hold_integrity`: Enforces that any seat with status `HELD` MUST have both `held_by` and `hold_expires_at` populated.
  4. `chk_users_email_format`: Regular expression pattern constraint on user email addresses.
  5. `uq_section_row_seat`: Composite unique constraint preventing duplicate physical seat definitions in a section.
  6. `ON DELETE RESTRICT`: Prohibits cascading deletion of parent records (e.g. venues or users) while active transactional dependencies exist.

### Suite 4: Demand-Driven Dynamic Pricing & Clamp Boundaries (`tests/pricing.test.ts`)
- **Assertions:**
  1. Baseline demand defaults to `base_price` (Rs 3,500).
  2. Min Price Clamp: When base price or low occupancy produces a figure below the configured minimum, price is clamped to `min_price` (Rs 2,500).
  3. Max Price Clamp: Under surge conditions (100% occupancy + high view traffic), calculated price is strictly clamped to `max_price` ceiling (Rs 5,000).
  4. MongoDB Behavioral Telemetry: Aggregates real telemetry view documents from MongoDB using rolling 1-hour time window.

### Suite 5: Automated FIFO Waitlist Allocation & Cascade (`tests/waitlist.test.ts`)
- **Assertions:**
  1. FIFO Priority: The customer at queue position #1 is evaluated and promoted first.
  2. Quantity-Aware Allocation: Entrants whose requested ticket quantity fits into available inventory are promoted; entrants requiring more seats remain `WAITING`.
  3. Multi-Entrant Cascade: Released inventory cascades sequentially until seats are exhausted.
  4. Promotion Timeout Expiry: Stale holds exceeding 15 minutes expire and free seats for the next waiting customer.

---

## 3. Actual Console Execution Output

```text
> venueflow@1.0.0 test
> tsx tests/run-all.ts

================================================================
        VENUEFLOW COMPREHENSIVE DBMS & BACKEND TEST SUITE       
================================================================

--- Running Authorization & Security Tests ---
✓ Password hashing uses salted bcrypt with correct verification.
✓ JWT role verification correctly discriminates customer, manager, and admin roles.
✓ Tampered JWT signature is rejected.

--- Running Concurrency & Double-Booking Prevention Tests ---
Initiating 2 simultaneous booking transactions on Show #1, Seat #45...
✓ Result 1: Transaction-A (User 5) confirmed: Booking successful
✓ Result 2: Transaction-B (User 6) rejected: Lock contention, seat is held by another transaction
✓ Row-level lock guarantee: Exactly 1 transaction succeeded, 1 was rejected.
✓ Storage engine guarantee: Partial UNIQUE index idx_show_seats_unique_booked rejects duplicates.

--- Running Database-Level Constraint Tests ---
✓ CHECK Constraint chk_show_time_range (end_time > start_time) verified.
✓ CHECK Constraint chk_pricing_rule_bounds (max_price >= min_price > 0) verified.
✓ CHECK Constraint chk_hold_integrity (HELD requires held_by and expiration timestamp) verified.
✓ CHECK Constraint chk_users_email_format regex pattern verified.
✓ UNIQUE Constraint uq_section_row_seat prevents duplicate physical seat labels.
✓ Foreign Key ON DELETE RESTRICT policy prevents orphaned child records.

--- Running Dynamic Pricing & Clamping Tests ---
✓ Dynamic pricing strictly respects min_price floor (clamped at Rs 2,500).
✓ Dynamic pricing strictly respects max_price ceiling (clamped at Rs 5,000).
✓ Moderate demand surge correctly calculated: Rs 4865.
✓ MongoDB aggregation pipeline successfully counted 2 views in rolling 1-hour window.

--- Running FIFO Waitlist Promotion Tests ---
✓ FIFO Priority 1: First entrant at position #1 promoted for 2 seats.
✓ FIFO Multi-Entrant Cascade: Entrant #2 and Entrant #4 promoted, respecting seat quantity.
✓ Quantity boundary check: Entrant requesting 4 seats correctly remains WAITING when insufficient seats exist.
✓ Stale hold expiry simulated: 2 seats returned from expired promotion.

================================================================
                     TEST EXECUTION SUMMARY                     
================================================================
[✓ PASSED] Role-Based Access Control & Password Hashing         (384ms)
[✓ PASSED] Pessimistic Concurrency & Double-Booking Protection  (24ms)
[✓ PASSED] Database-Level CHECK, UNIQUE & FK Constraints        (2ms)
[✓ PASSED] Demand-Driven Dynamic Pricing & Clamp Boundaries     (103ms)
[✓ PASSED] Automated FIFO Waitlist Allocation & Cascade         (0ms)
----------------------------------------------------------------
Total Suites: 5 | Passed: 5 | Failed: 0
Total Execution Time: 514ms
================================================================
```
