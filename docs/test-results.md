# VenueFlow — Automated Test Execution Results (Real PostgreSQL & MongoDB)

> **DBMS Level 3 Capstone Evaluation Report**  
> All tests executed against **active native PostgreSQL 18.4** and **active native MongoDB 7.x** (Zero mocks used).

---

## 1. Test Suite Summary

- **Test Runner:** `tests/run-all.ts`
- **Execution Command:** `npm test` (incorporating automated reseeding for 100% test idempotence)
- **Database Targets:**
  - PostgreSQL 18.4 on `localhost:5432` (database: `venueflow`, raw SQL via `pg` pool)
  - MongoDB 7.x on `localhost:27017` (database: `venueflow`, official driver)
- **Result:** **5 Suites Executed, 5 Passed, 0 Failed (100% Success)**
- **Total Execution Time:** ~1538 ms

| Test Suite | Focus Area | Database Engine | Status | Time |
| :--- | :--- | :--- | :--- | :--- |
| **Suite 1** | Role-Based Access Control & Multi-Tenant Isolation | Next.js API Routes / Bcrypt / JWT | **PASSED** | 410 ms |
| **Suite 2** | Pessimistic Concurrency & Double-Booking Protection | PostgreSQL (`SELECT ... FOR UPDATE` + Partial UNIQUE) | **PASSED** | 89 ms |
| **Suite 3** | Database-Level CHECK, UNIQUE & FK Constraints | PostgreSQL (asserting codes 23514, 23505, 23503) | **PASSED** | 152 ms |
| **Suite 4** | Demand-Driven Dynamic Pricing & Clamp Boundaries | MongoDB Aggregation + PG `calculate_dynamic_price()` | **PASSED** | 131 ms |
| **Suite 5** | Automated FIFO Waitlist Allocation & Cascade | PostgreSQL Triggers + `promote_waitlist_fifo()` | **PASSED** | 149 ms |

---

## 2. Actual Live Console Output

### 2.1 Database Initialization (`npm run db:init`)

```text
> venueflow@1.0.0 db:init
> tsx scripts/db-init.ts

--- Initializing VenueFlow PostgreSQL Database ---
Executing db/schema.sql...
✓ db/schema.sql completed.
Executing db/functions_triggers.sql...
✓ db/functions_triggers.sql completed.
Executing db/views_indexes.sql...
✓ db/views_indexes.sql completed.
Database initialization completed successfully.
```

### 2.2 Database Seeding (`npm run db:seed`)

```text
> venueflow@1.0.0 db:seed
> tsx scripts/db-seed.ts

--- Seeding VenueFlow PostgreSQL Database ---
Executing db/seed.sql...
✓ db/seed.sql executed successfully.
```

### 2.3 Automated Test Suite Execution (`npm test`)

```text
> venueflow@1.0.0 test
> npm run db:seed && tsx tests/run-all.ts


> venueflow@1.0.0 db:seed
> tsx scripts/db-seed.ts

--- Seeding VenueFlow PostgreSQL Database ---
Executing db/seed.sql...
✓ db/seed.sql executed successfully.
================================================================
        VENUEFLOW COMPREHENSIVE DBMS & BACKEND TEST SUITE       
================================================================

--- Running Authorization & Security Tests ---
✓ Password hashing uses salted bcrypt with correct verification.
✓ JWT role verification correctly discriminates customer, manager, and admin roles.
✓ Tampered JWT signature is rejected.
✓ Customer gets 403 Forbidden on all /api/manager/* routes.
✓ Customer gets 403 Forbidden on all /api/admin/* routes.
✓ Manager A gets 403 Forbidden when attempting to edit Manager B's venue.
✓ Manager A gets 403 Forbidden when attempting to edit Manager B's pricing rule.

--- Running Concurrency & Double-Booking Prevention Tests (Real PostgreSQL) ---
Targeting Show #1, Seat #7 (A-7) for concurrent race test...
✓ Winner: Booking #4 (BK-20261020-91E2GP) confirmed for User.
✓ Rejected: Concurrent transaction failed safely with: "Seat A-7 is already booked."
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
✓ Verified in PostgreSQL price_history: New Price=Rs 7500.00, Reason="Dynamic update: Occ=10.0%, Views=500, Abandon=100 (Mult: 3.890)"

--- Running FIFO Waitlist Promotion Tests (Real PostgreSQL) ---
✓ User #11 joined waitlist in PostgreSQL at FIFO position #4.
Cancelling Booking #3 (2 seats) in presence of spare AVAILABLE seats...
✓ Verified: Only first FIFO entrant (User 8) was promoted; subsequent entrants remained WAITING.
✓ Verified: User 8 holds exactly 2 seats on HELD (no double-holding or spare seat leakage).
Testing expired waitlist promotion cascade to next FIFO entrant...
✓ Verified: Expired promotion for User 8 cascaded to User 9 (now PROMOTED, holding 1 seat).

================================================================
                     TEST EXECUTION SUMMARY                     
================================================================
[✓ PASSED] Role-Based Access Control & Password Hashing         (410ms)
[✓ PASSED] Pessimistic Concurrency & Double-Booking Protection  (89ms)
[✓ PASSED] Database-Level CHECK, UNIQUE & FK Constraints        (152ms)
[✓ PASSED] Demand-Driven Dynamic Pricing & Clamp Boundaries     (131ms)
[✓ PASSED] Automated FIFO Waitlist Allocation & Cascade         (149ms)
----------------------------------------------------------------
Total Suites: 5 | Passed: 5 | Failed: 0
Total Execution Time: 1538ms
================================================================
```

---

## 3. Database Engine Invariants Verified

1. **Role-Based Access Control & Cross-Manager Isolation**:
   - Customers receiving `403 Forbidden` when attempting to access any `/api/manager/*` or `/api/admin/*` endpoints.
   - Manager A (User 2) receiving `403 Forbidden` when attempting to modify Manager B's venue (Venue 2) or pricing rules (Pricing Rule 3).
2. **Race Condition Prevention**:
   - Under simultaneous competing `Promise.all` requests, PostgreSQL pessimistic row locking (`SELECT ... FOR UPDATE`) guarantees serialization. Exactly one transaction commits, and the second is rejected with a conflict error.
3. **Database Engine Constraint Enforcement**:
   - Invalid records cannot be inserted even by rogue API clients. PostgreSQL returns standard ANSI/SQL error codes:
     - `23514`: Inverted start/end show times, negative prices, and orphan seat holds rejected.
     - `23505`: Duplicate user emails and duplicate section seat coordinates rejected.
     - `23503`: Shows referencing nonexistent venue foreign keys rejected.
4. **Polyglot Demand Pipeline & Dynamic Pricing Formatting**:
   - Live documents ingested into MongoDB collections are aggregated within rolling time windows and injected into the PostgreSQL stored function `calculate_dynamic_price()`, which enforces hard `min_price` and `max_price` boundaries.
   - Price adjustment audit log reasons are formatted accurately (e.g., `Reason="Dynamic update: Occ=10.0%, Views=500, Abandon=100 (Mult: 3.890)"`).
5. **Automated FIFO Waitlist Promotion & Cascade**:
   - Waitlist promotion upon cancellation relies strictly on the transactional PostgreSQL trigger `trg_waitlist_promotion_on_cancellation`.
   - In the presence of spare AVAILABLE seats, only the first FIFO entrant is promoted and holds exactly `requested_quantity` seats.
   - Expired promotions transition to `EXPIRED`, releasing held seats back to the show and cascading promotion to the next entrant in FIFO order.
6. **Test Suite Idempotency**:
   - The test runner automatically reseeds the PostgreSQL database before and after runs, ensuring repeatable, non-destructive test execution on any environment.
