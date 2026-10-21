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
- **Node.js**: v18+ (tested on v20 & v22)
- **Database Options**: Choose either **Option A (Docker)** or **Option B (Embedded PostgreSQL + Local MongoDB)**.

---

### 4.2 Database Setup Options

#### Option A: Docker Setup (Recommended if Docker Desktop is installed)
Spin up PostgreSQL 16 and MongoDB 7 in isolated containers with a single command:
```bash
docker compose up -d
```
This runs PostgreSQL on `localhost:5432` (user: `postgres`, password: `password`, db: `venueflow`) and MongoDB on `localhost:27017`.

#### Option B: Embedded PostgreSQL Setup (Zero External Postgres Install Required)
If Docker is not installed or you prefer a lightweight, self-contained setup:
1. Ensure MongoDB is running locally on port 27017 (e.g., Windows MongoDB service or `mongod`).
2. Start the embedded PostgreSQL server (persists to `.pgdata` on port 5432):
```bash
npm run pg:start
```
> **Note:** `npm run pg:start` uses `embedded-postgres` (PostgreSQL 18 binary) targeting `.pgdata`. Keep this terminal tab open or run it as a background service while developing and testing.

---

### 4.3 Configure Environment Variables
Copy `.env.example` to `.env` if not already present:
```bash
cp .env.example .env
```
Default connection parameters:
- `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/venueflow`
- `PGHOST=localhost`
- `PGPORT=5432`
- `PGUSER=postgres`
- `PGPASSWORD=postgres`
- `PGDATABASE=venueflow`
- `MONGODB_URI=mongodb://localhost:27017/venueflow`
- `MONGODB_DB_NAME=venueflow`
- `JWT_SECRET=venueflow-dev-secret-key-change-in-production-min32chars`

---

### 4.4 Initialize and Seed Databases
Execute the one-command setup scripts against your running database:
```bash
# 1. Initialize MongoDB collections, compound indexes, and TTL eviction policies
npm run mongo:init

# 2. Initialize PostgreSQL schema, stored functions, triggers, and analytical views
npm run db:init

# 3. Populate database with realistic venues, shows, seats, pricing rules, and users
npm run db:seed
```

---

### 4.5 Run the Development API Server
```bash
npm run dev
```
The API is available at `http://localhost:3000/api`. Verify database health:
```bash
curl http://localhost:3000/api/health
```

---

### 4.6 Run the Automated Test Suite
Execute all 5 evaluation test suites with automatic reseeding and idempotent teardown:
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

---

## Frontend (Person 2) — Next.js Application Layer

The UI is a Next.js App Router client built against the API contract above. It is
styled with Tailwind CSS v4 and animated with Motion (`motion/react`).

### Additional setup

Beyond the backend steps above, the frontend needs two packages (already in
`package.json` after install):

```bash
npm install motion
npm install -D tailwindcss @tailwindcss/postcss
npm run dev
```

### Routes

| Route | Role | Purpose |
| :--- | :--- | :--- |
| `/` | public | Landing page; live catalogue from `GET /api/events` |
| `/events` | public | Browse with full-text search, genre/city filters, pagination |
| `/events/[id]` | public | Event detail with showtimes and live availability |
| `/shows/[id]` | public / customer | **Seat map**, dynamic pricing panel, atomic booking, waitlist |
| `/login`, `/register` | public | Authentication against the JWT cookie session |
| `/bookings` | authenticated | Booking history and cancellation (fires the waitlist trigger) |
| `/waitlist` | authenticated | FIFO queue position, people ahead, promotion countdown |
| `/manager` | manager, admin | Venue summaries and show occupancy from the SQL views |
| `/admin` | admin | Platform financials, role mix, revenue by event, audit trail |

### Architecture notes

- **`lib/api.ts`** — single `apiFetch()` wrapper over the `{ success, data, error }`
  envelope. Throws a typed `ApiError` carrying the backend error `code`, so the UI
  can branch on `SEATS_UNAVAILABLE` specifically rather than parsing message text.
  Also exports `track()` for behavioural telemetry and `inr()` for currency.
- **`lib/auth-context.tsx`** — session provider. The JWT lives in a `httpOnly`
  cookie and is deliberately unreadable from JavaScript, so session state is
  resolved by calling `GET /api/auth/me` on mount.
- **`components/Protected.tsx`** — client-side route guard. This is convenience
  only; authorisation is enforced by `requireRole()` in the API middleware. Hiding
  a button is not access control.
- **Behavioural tracking** — the UI posts `search`, `view` and `abandoned_checkout`
  events to `POST /api/tracking`. These are the MongoDB documents the demand
  aggregation consumes, so the dynamic price only moves because the frontend emits
  them.
- **Chart colours** — the categorical palette (`--color-chart-1..3` in
  `app/globals.css`) was validated for colour-vision-deficiency separation and
  OKLCH lightness against the dark surface. Charts always pair colour with a
  direct label or legend, never colour alone.

### Demonstrating the advanced database features in the UI

| Concept | Where to see it |
| :--- | :--- |
| Transaction + row lock | Open one show in two browsers, select the same seat, confirm both — exactly one succeeds, the other gets `SEATS_UNAVAILABLE` |
| Trigger (waitlist) | Cancel a booking on `/bookings`; the released-seat count is reported and the queue advances |
| Stored function (pricing) | The price panel on `/shows/[id]` shows base price, live dynamic price, demand tier and the min/max caps |
| Full-text search | The search box on `/events` queries the `tsvector` GIN index |
| Views | `/manager` renders `manager_dashboard_view` and `show_occupancy_view`; `/admin` renders `revenue_by_event_view` |
| NoSQL aggregation | Repeated searches and abandoned checkouts raise the demand tier shown on the seat map |
