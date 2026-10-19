# VenueFlow — Polyglot Database Architecture & Justification

> **DBMS Level 3 Capstone Requirement:** Rigorous technical justification for polyglot persistence — evaluating relational (PostgreSQL) vs document-oriented NoSQL (MongoDB) within VenueFlow's ticketing and dynamic pricing ecosystem.

---

## 1. Architectural Overview

Ticketing platforms face two fundamentally conflicting workloads:
1. **High-Value Transactional Integrity (ACID)**: Zero tolerance for data corruption, lost updates, or double-selling of finite physical inventory (seats).
2. **High-Velocity Behavioral Telemetry (BASE)**: High write throughput, schema-volatile search and clickstream events, and rolling aggregations that would degrade transactional databases.

VenueFlow addresses this via **Polyglot Persistence**:

```text
┌────────────────────────────────────────────────────────┐
│                   VenueFlow Clients                    │
└────────────┬─────────────────────────────┬─────────────┘
             │ HTTP / JSON                 │ HTTP / JSON
             ▼                             ▼
┌───────────────────────────┐ ┌───────────────────────────┐
│     Transactional API     │ │    Telemetry Ingestion    │
│    (/api/bookings, auth)  │ │      (/api/tracking)      │
└────────────┬──────────────┘ └────────────┬──────────────┘
             │ Raw SQL (pg)                │ MongoDB Driver
             ▼                             ▼
┌───────────────────────────┐ ┌───────────────────────────┐
│      PostgreSQL 14+       │ │        MongoDB 7+         │
│  Relational Database (SQL)│ │   Document Store (NoSQL)  │
│                           │ │                           │
│ • Users & RBAC            │ │ • search_events           │
│ • Venues, Sections, Seats │ │ • event_views             │
│ • Events & Shows          │ │ • abandoned_checkouts     │
│ • ACID Transactions       │ │ • Rolling 1h Aggregations │
│ • Pessimistic Row Locking │ │ • Automated TTL Eviction  │
│ • Stored Triggers & Views │ │                           │
└────────────▲──────────────┘ └────────────┬──────────────┘
             │                             │
             └──────── Demand Multipliers ─┘
```

---

## 2. PostgreSQL (Relational) Justification

### 2.1 ACID Guarantees & Concurrency Isolation
- **Atomicity**: Booking a ticket requires updating seat states, generating a booking header, inserting itemized lines, and creating a simulated payment ledger. If payment simulation fails, all seat reservations must automatically roll back.
- **Consistency**: Enforced through database-level domain constraints (`CHECK`, `FOREIGN KEY`, `NOT NULL`, `UNIQUE`) rather than brittle application-level checks.
- **Isolation (Pessimistic Row Locking)**:
  ```sql
  SELECT id, status FROM show_seats 
  WHERE show_id = $1 AND seat_id = ANY($2::int[]) 
  FOR UPDATE;
  ```
  PostgreSQL locks the exact rows in the buffer pool, forcing competing concurrent transactions to queue until the first transaction commits or rolls back.
- **Physical Prevention of Double Booking**:
  ```sql
  CREATE UNIQUE INDEX idx_show_seats_unique_booked 
  ON show_seats (show_id, seat_id) 
  WHERE (status = 'BOOKED');
  ```
  Even in the event of an application crash or bug, the storage engine rejects any duplicate booking at the B-tree index level.

### 2.2 Relational Geometry & 3NF Normalization
Physical venue layouts naturally adhere to relational hierarchies:
$$\text{Venue} \xrightarrow{1:N} \text{Section} \xrightarrow{1:N} \text{Seat} \xrightarrow{1:N} \text{ShowSeat} \xrightarrow{1:1} \text{BookingItem}$$
Normalizing to 3NF avoids data anomalies and prevents storing redundant venue or section details across millions of show instances.

### 2.3 Server-Side Business Logic
- **Triggers**: Instantly sync show discovery statuses (`SOLD_OUT`, `SELLING_FAST`) and record immutable JSONB audit trails on mutations without API latency.
- **Stored Functions**: The `calculate_dynamic_price()` procedure executes directly inside the database engine, avoiding round-trip latency when calculating occupancy ratios and applying pricing formulas.
- **Full-Text Search**: Native `tsvector` with GIN indexing eliminates the need to maintain an external Elasticsearch cluster for event discovery.

---

## 3. MongoDB (NoSQL) Justification

### 3.1 High-Velocity Behavioral Ingestion
Search queries, page visits, and abandoned seat selections generate continuous, append-only write traffic. Writing these high-frequency events directly into PostgreSQL would cause:
- Severe write-amplification.
- Table bloat in MVCC (requiring aggressive VACUUM runs).
- Transaction lock contention on shared database connections.

MongoDB accepts asynchronous, unindexed or lightly indexed document writes with sub-millisecond latencies.

### 3.2 Schema Flexibility
Telemetry events vary widely:
- A search event may include freeform strings, location coordinates, genre filters, and price bounds.
- An abandoned checkout captures varying arrays of selected seats, abandoned step names (`seat_selection`, `hold_initiated`), and client metadata (`userAgent`, `referrer`).
MongoDB natively handles this polymorphic semi-structured data without complex schema migrations or sparse columns.

### 3.3 Automatic Time-to-Live (TTL) Eviction
Behavioral telemetry loses relevance rapidly. MongoDB handles automatic document expiration natively at the storage engine level:
```javascript
db.event_views.createIndex({ timestamp: 1 }, { expireAfterSeconds: 2592000 }); // 30 days
```
This eliminates cron jobs and bulky `DELETE FROM ... WHERE timestamp < ...` operations that would cause table locks in a relational database.

### 3.4 Aggregation Pipeline Efficiency
Computing demand surges across thousands of rolling page views is handled in MongoDB using memory-efficient aggregation pipelines:
```javascript
db.event_views.aggregate([
  { $match: { showId: targetShowId, timestamp: { $gte: cutoff } } },
  { $group: { _id: "$showId", count: { $sum: 1 } } }
]);
```
The aggregated metrics are then passed cleanly to PostgreSQL's dynamic pricing procedure.

---

## 4. Architectural Comparison Matrix

| Evaluation Dimension | PostgreSQL 14+ (Relational) | MongoDB 7+ (Document) | VenueFlow Allocation |
| :--- | :--- | :--- | :--- |
| **Primary Workload** | OLTP Financial Transactions | High-Velocity Telemetry Streams | Hybrid / Polyglot |
| **Consistency Model** | Immediate Consistency (ACID) | Eventual Consistency (BASE) | SQL for Money; NoSQL for Signals |
| **Concurrency Control** | MVCC + Pessimistic Row Locking (`FOR UPDATE`) | Document-level locking | PostgreSQL guarantees no double-booking |
| **Data Structure** | Strictly Normalized Tables (3NF) | JSON/BSON Flexible Documents | Relational seats/shows; Flexible telemetry |
| **Integrity Checks** | Engine-level FKs, CHECKs, Domain ENUMs | Application-level or JSON Schema | PostgreSQL enforces all business invariants |
| **Retention Policy** | Permanent financial audit log | Rolling TTL Index auto-eviction | MongoDB purges raw telemetry after 14–90 days |
| **Query Engine** | Relational Algebra, SQL joins, Window Functions | Aggregation Framework ($match, $group) | SQL for analytics; Mongo for sliding demand |
| **Search Capability** | Native GIN Full-Text Search (`tsvector`) | Text Index | PostgreSQL GIN index on `search_vector` |

---

## 5. Conclusion & Academic Justification

VenueFlow’s polyglot architecture is not an arbitrary combination of technologies, but an intentional separation of concerns:
- **PostgreSQL** guarantees the integrity of physical assets, financial transactions, and user permissions where data loss or concurrency anomalies are intolerable.
- **MongoDB** absorbs the high-volume behavioral telemetry necessary for demand calculation without taxing the transactional database.

This dual-database model allows each engine to operate in its area of greatest strength, providing a realistic, production-grade architecture suitable for advanced DBMS evaluation.
