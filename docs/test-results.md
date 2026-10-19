# VenueFlow — Automated Test Execution Results (Real PostgreSQL & MongoDB)

> **DBMS Level 3 Capstone Evaluation Report**  
> All tests executed against **active native PostgreSQL 18.4** and **active native MongoDB 7.x** (Zero mocks used).

---

## 1. Test Suite Summary

- **Test Runner:** `tests/run-all.ts`
- **Execution Command:** `npm test`
- **Database Targets:**
  - PostgreSQL 18.4 on `localhost:5432` (database: `venueflow`, raw SQL via `pg` pool)
  - MongoDB 7.x on `localhost:27017` (database: `venueflow`, official driver)
- **Result:** **5 Suites Executed, 5 Passed, 0 Failed (100% Success)**
- **Total Execution Time:** ~810 ms

| Test Suite | Focus Area | Database Engine | Status | Time |
| :--- | :--- | :--- | :--- | :--- |
| **Suite 1** | Role-Based Access Control & Password Hashing | In-memory / Bcrypt / JWT | **PASSED** | 374 ms |
| **Suite 2** | Pessimistic Concurrency & Double-Booking Protection | PostgreSQL (`SELECT ... FOR UPDATE` + Partial UNIQUE) | **PASSED** | 120 ms |
| **Suite 3** | Database-Level CHECK, UNIQUE & FK Constraints | PostgreSQL (asserting codes 23514, 23505, 23503) | **PASSED** | 151 ms |
| **Suite 4** | Demand-Driven Dynamic Pricing & Clamp Boundaries | MongoDB Aggregation + PG `calculate_dynamic_price()` | **PASSED** | 85 ms |
| **Suite 5** | Automated FIFO Waitlist Allocation & Cascade | PostgreSQL Triggers + `promote_waitlist_fifo()` | **PASSED** | 80 ms |

---

## 2. Actual Live Console Output (`npm test`)

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

--- Running Concurrency & Double-Booking Prevention Tests (Real PostgreSQL) ---
Targeting Show #1, Seat #5 (B-1) for concurrent race test...
✓ Winner: Booking #4 (BK-20261019-21XZP9) confirmed for User.
✓ Rejected: Concurrent transaction failed safely with: "Seat B-1 is already booked."
✓ Verified in real PostgreSQL: Seat is marked BOOKED exactly once.
✓ Test cleanup completed: Booking #4 cancelled, seat released.

--- Running Database-Level Constraint Tests (Real PostgreSQL) ---
✓ CHECK Constraint chk_show_time_range threw PostgreSQL error 23514 (check_violation).
✓ CHECK Constraint chk_pricing_rule_bounds verified with PostgreSQL error code 23514.
✓ CHECK Constraint chk_hold_integrity threw PostgreSQL error 23514 (check_violation).
✓ UNIQUE Constraint on users(email) threw PostgreSQL error 23505 (unique_violation).
✓ Composite UNIQUE Constraint uq_section_row_seat threw PostgreSQL error 23505 (unique_violation).
✓ FOREIGN KEY Constraint on shows(venue_id) threw PostgreSQL error 23503 (foreign_key_violation).

--- Running Dynamic Pricing & Clamping Tests (Real PG + Mongo) ---
Show #1 Baseline: Base=Rs 3500, Min=Rs 3000, Max=Rs 7500
✓ Computed Dynamic Price: Rs 3771.25
✓ MongoDB Telemetry Captured: 15 views past hour
✓ Dynamic price strictly clamped within [min_price, max_price] bounds.
✓ Extreme demand surge ceiling clamp verified: Rs 7500 == max_price (7500).
✓ Verified in PostgreSQL price_history: New Price=Rs 7500.00, Reason="Dynamic update: Occ=%10.0, Views=500, Abandon=100 (Mult: 3.890)"

--- Running FIFO Waitlist Promotion Tests (Real PostgreSQL) ---
✓ User #11 joined waitlist in PostgreSQL at FIFO position #4.
Cancelling Booking #3 to release seats and trigger waitlist promotion...
✓ Verified in PostgreSQL: Entrant at FIFO Position #1 (User 8) promoted with deadline Mon Oct 19 2026 22:58:19 GMT+0530 (India Standard Time).
✓ Verified in PostgreSQL: 2 seats placed on temporary HOLD for promoted user.

================================================================
                     TEST EXECUTION SUMMARY                     
================================================================
[✓ PASSED] Role-Based Access Control & Password Hashing         (374ms)
[✓ PASSED] Pessimistic Concurrency & Double-Booking Protection  (120ms)
[✓ PASSED] Database-Level CHECK, UNIQUE & FK Constraints        (151ms)
[✓ PASSED] Demand-Driven Dynamic Pricing & Clamp Boundaries     (85ms)
[✓ PASSED] Automated FIFO Waitlist Allocation & Cascade         (80ms)
----------------------------------------------------------------
Total Suites: 5 | Passed: 5 | Failed: 0
Total Execution Time: 810ms
================================================================
```

---

## 3. Database Engine Invariants Verified

1. **Race Condition Prevention**:
   Under simultaneous competing `Promise.all` requests, PostgreSQL pessimistic row locking (`SELECT ... FOR UPDATE`) guarantees serialization. Exactly one transaction commits, and the second is rejected with a conflict error.
2. **Database Engine Constraint Enforcement**:
   Invalid records cannot be inserted even by rogue API clients. PostgreSQL returns standard ANSI/SQL error codes:
   - `23514`: Inverted start/end show times, negative prices, and orphan seat holds rejected.
   - `23505`: Duplicate user emails and duplicate section seat coordinates rejected.
   - `23503`: Shows referencing nonexistent venue foreign keys rejected.
3. **Polyglot Demand Pipeline**:
   Live documents ingested into MongoDB collections are aggregated within rolling time windows and injected into the PostgreSQL stored function `calculate_dynamic_price()`, which enforces hard `min_price` and `max_price` boundaries and logs adjustments into `price_history`.
4. **Automated FIFO Waitlist Promotion**:
   When booking #3 is cancelled, available seats are immediately released, the PostgreSQL trigger `trg_waitlist_promotion_on_cancellation` executes, promoting Ananya (User #8, Position #1), setting her deadline to `NOW() + INTERVAL '15 minutes'`, and locking the 2 released seats into `HELD` status for her account.
