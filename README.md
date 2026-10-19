# VenueFlow — A Multi-Venue Ticketing Platform with Demand-Driven Dynamic Pricing & Automated Waitlist Fulfilment

> **DBMS Level 3 Capstone Project (University Level)**  
> **Role:** Person 1 (Database Architecture, Backend API & Business Logic Lead)  
> **Frontend:** Person 2 develops Next.js UI pages in the same repository against the stable API contract.

---

## 1. Executive Summary & Architecture

VenueFlow is an enterprise-grade ticketing platform engineered for high-concurrency stadium and auditorium events. It implements a **polyglot persistence architecture** separating transactional financial consistency from high-velocity behavioral telemetry:

```text
                               ┌────────────────────────┐
                               │   Next.js API Layer    │
                               │  (/app/api/** Handlers)│
                               └───────────┬────────────┘
                                           │
                    ┌──────────────────────┴──────────────────────┐
                    │                                             │
                    ▼                                             ▼
       ┌────────────────────────┐                    ┌────────────────────────┐
       │     PostgreSQL 14+     │                    │       MongoDB 7+       │
       │   (Relational / ACID)  │                    │   (Document / BASE)    │
       ├────────────────────────┤                    ├────────────────────────┤
       │ • Raw SQL (`pg` driver)│                    │ • Official Mongo Driver│
       │ • 3NF Normalized Tables│                    │ • High-Write Telemetry │
       │ • Pessimistic Locks    │                    │ • Search & Page Views  │
       │ • Stored Functions     │                    │ • Abandoned Checkouts  │
       │ • Triggers & Views     │                    │ • TTL Auto-Eviction    │
       │ • GIN Full-Text Search │                    │ • Demand Aggregations  │
       └────────────────────────┘                    └────────────────────────┘
```

---

## 2. Course Rubric Compliance Matrix

| Evaluation Requirement | Academic Implementation | File Location |
| :--- | :--- | :--- |
| **ER Diagram** | Complete entity modeling with keys, attributes, and cardinalities | [`docs/er-diagram.md`](./docs/er-diagram.md) |
| **Relational Schema & 3NF Proof** | Relational mapping, Functional Dependencies (FDs), 1NF/2NF/3NF proofs | [`docs/relational-schema.md`](./docs/relational-schema.md) |
| **Data Dictionary** | Complete technical dictionary for all 14 tables and columns | [`docs/data-dictionary.md`](./docs/data-dictionary.md) |
| **DDL (CREATE, ALTER, DROP)** | Production DDL + Non-destructive ALTER/DROP demonstration script | [`db/schema.sql`](./db/schema.sql), [`db/alter_drop_demo.sql`](./db/alter_drop_demo.sql) |
| **DML Operations** | Structured INSERT, UPDATE, DELETE, and SELECT across APIs | [`lib/services/booking.ts`](./lib/services/booking.ts), API routes |
| **Complex Queries** | 10 commented queries (JOIN, GROUP BY, HAVING, subqueries, CTEs, Window functions) | [`db/queries.sql`](./db/queries.sql) |
| **Pessimistic Concurrency (Locks)** | `SELECT ... FOR UPDATE` row locks; partial unique index preventing double-booking | [`lib/services/booking.ts`](./lib/services/booking.ts), [`tests/concurrent-booking.test.ts`](./tests/concurrent-booking.test.ts) |
| **Stored Functions & Triggers** | `calculate_dynamic_price`, past-show checks, seat sync, waitlist promo, audit log | [`db/functions_triggers.sql`](./db/functions_triggers.sql) |
| **Analytical Views** | `show_occupancy_view`, `revenue_by_event_view`, `manager_dashboard_view` | [`db/views_indexes.sql`](./db/views_indexes.sql) |
| **Full-Text Search (FTS)** | `tsvector` generated column with weighted attributes + GIN index | [`db/schema.sql`](./db/schema.sql), [`app/api/events/route.ts`](./app/api/events/route.ts) |
| **MongoDB Aggregation** | Sliding 1-hour window aggregations on views and abandoned checkout signals | [`lib/services/pricing.ts`](./lib/services/pricing.ts), [`docs/mongo-data-model.md`](./docs/mongo-data-model.md) |
| **Domain Constraints** | CHECK, UNIQUE, NOT NULL, FK ON DELETE RESTRICT/CASCADE, Domain ENUMs | [`db/schema.sql`](./db/schema.sql), [`tests/constraints.test.ts`](./tests/constraints.test.ts) |
| **Role-Based Access Control** | 3 enforced roles (`customer`, `manager`, `admin`) with middleware guards | [`lib/auth/middleware.ts`](./lib/auth/middleware.ts), [`tests/auth.test.ts`](./tests/auth.test.ts) |
| **Security & Passwords** | Salted Bcrypt hashing (10 rounds); JWT in httpOnly secure cookies | [`lib/auth/password.ts`](./lib/auth/password.ts), [`lib/auth/jwt.ts`](./lib/auth/jwt.ts) |
| **Polyglot Justification** | Rigorous architectural comparison of SQL vs NoSQL | [`docs/db-justification.md`](./docs/db-justification.md) |
| **Automated Test Suite** | 5 comprehensive suites verifying transactions, constraints, pricing, waitlists | [`tests/run-all.ts`](./tests/run-all.ts), [`docs/test-results.md`](./docs/test-results.md) |

---

## 3. Repository Structure

```text
├── app/
│   └── api/                     # Next.js Route Handlers (API Layer)
│       ├── auth/                # register, login, logout, me
│       ├── events/              # catalog discovery with GIN full-text search
│       ├── shows/[id]/seats/    # seat grid & dynamic pricing
│       ├── shows/[id]/waitlist/ # FIFO waitlist queueing
│       ├── bookings/            # safe transactional booking & cancellation
│       ├── tracking/            # MongoDB telemetry ingestion
│       ├── manager/             # event management & pricing rules
│       ├── analytics/           # manager & admin dashboard views
│       └── health/              # database connectivity check
├── db/
│   ├── schema.sql               # PostgreSQL 3NF DDL with constraints & GIN index
│   ├── functions_triggers.sql   # Dynamic pricing, triggers, waitlist promotion, audit
│   ├── views_indexes.sql        # Analytical views & indexing strategy
│   ├── seed.sql                 # Realistic multi-venue, multi-show dataset
│   ├── queries.sql              # 10 commented complex analytical SQL queries
│   ├── alter_drop_demo.sql      # Non-destructive DDL demo script
│   └── mongo/
│       └── setup.ts             # MongoDB collections, compound indexes, TTL eviction
├── lib/
│   ├── db/                      # PostgreSQL (pg pool) & MongoDB client singletons
│   ├── auth/                    # Bcrypt hashing, JWT tokens, NextRequest role guards
│   └── services/                # Booking transactions, pricing logic, waitlist queue
├── docs/                        # Complete technical documentation suite
├── scripts/                     # db-init, db-seed, mongo-init scripts
├── tests/                       # Concurrency, constraint, pricing, waitlist test suites
├── docker-compose.yml           # Local PostgreSQL & MongoDB containerization
└── package.json                 # Project dependencies & npm scripts
```

---

## 4. Quickstart & Local Setup Guide

### 4.1 Prerequisites
- **Node.js**: v18+ (tested on v22)
- **PostgreSQL**: v14+ (local service, Docker, or Cloud PG such as Neon / Supabase)
- **MongoDB**: v6+ (running on `localhost:27017` or Docker)

### 4.2 Start Databases via Docker (Optional)
If you have Docker installed, spin up both databases with one command:
```bash
docker compose up -d
```

### 4.3 Configure Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Default connection parameters:
- `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/venueflow`
- `MONGODB_URI=mongodb://localhost:27017/venueflow`
- `JWT_SECRET=venueflow-dev-secret-key-change-in-production-min32chars`

### 4.4 Initialize and Seed Databases
Execute the one-command setup scripts:
```bash
# 1. Initialize MongoDB collections, compound indexes, and TTL eviction policies
npm run mongo:init

# 2. Initialize PostgreSQL schema, stored functions, triggers, and views
npm run db:init

# 3. Populate database with realistic venues, shows, seats, pricing rules, and users
npm run db:seed
```

### 4.5 Run the Development API Server
```bash
npm run dev
```
The API is available at `http://localhost:3000/api`. Verify health:
```bash
curl http://localhost:3000/api/health
```

### 4.6 Run the Automated Test Suite
Execute all 5 evaluation test suites:
```bash
npm test
```

---

## 5. Seed Credentials for Viva Demonstration

All seed accounts use the default password: **`Password123!`**

| Role | Email | Name / Purpose |
| :--- | :--- | :--- |
| **Admin** | `admin@venueflow.com` | Platform Administrator (cross-venue oversight, audit log access) |
| **Manager** | `manager.kanteerava@venueflow.com` | Venue Manager: Kanteerava Outdoor Stadium, Bengaluru |
| **Manager** | `manager.royal@venueflow.com` | Venue Manager: Royal Opera House, Mumbai |
| **Manager** | `manager.delhi@venueflow.com` | Venue Manager: Siri Fort Auditorium, New Delhi |
| **Customer** | `arjun.sharma@example.com` | Active customer with confirmed bookings |
| **Customer** | `ananya.iyer@example.com` | Customer at Position #1 on Show #2 waitlist (ready for promotion demo) |
| **Customer** | `rahul.nair@example.com` | Customer at Position #2 on Show #2 waitlist |

---

## 6. API Contract Documentation
For endpoint specifications, request/response JSON examples, and error codes used by Person 2's frontend, consult [`docs/api-contract.md`](./docs/api-contract.md).
