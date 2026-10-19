# VenueFlow — Backend & Database Engine

> **A Multi-Venue Ticketing Platform with Demand-Driven Dynamic Pricing and Automated Waitlist Fulfilment**  
> *DBMS Level 3 Capstone Project — Backend & Database Documentation*

---

## 1. System Architecture

VenueFlow uses a dual-database polyglot persistence architecture designed to balance strict transactional consistency with high-throughput behavioral tracking:

1. **PostgreSQL 14+ (Relational / ACID)**:
   - Primary database for users, venues, seat layouts, events, shows, bookings, dynamic pricing rules, payments, and waitlist queues.
   - Leverages **raw SQL queries with the `pg` driver** (no ORM), explicit transaction isolation (`BEGIN`, `COMMIT`, `ROLLBACK`), row-level pessimistic locking (`SELECT ... FOR UPDATE`), triggers, stored functions, views, domain CHECK constraints, and full-text search (`tsvector` + GIN).

2. **MongoDB 6+ / 7+ (Document / Telemetry)**:
   - Dedicated behavioral store for high-volume unstructured search queries, event view telemetry, and abandoned checkout signals.
   - Aggregations compute rolling demand scores feeding the PostgreSQL dynamic pricing pipeline.

3. **Next.js App Router (TypeScript Backend)**:
   - Route Handlers under `/app/api/**` serving pure JSON endpoints.
   - Authentication via `bcryptjs` password hashing and JWT in `httpOnly` secure cookies.
   - Request schema validation powered by `zod`.
   - Strict role-based access control (`customer`, `manager`, `admin`).

---

## 2. Repository Layout

```text
├── app/
│   └── api/                     # Next.js Route Handlers (API Layer)
│       └── health/route.ts      # Health check endpoint
├── db/
│   ├── schema.sql               # Core PostgreSQL DDL (Tables, Constraints, ENUMs)
│   ├── functions_triggers.sql   # Stored functions, dynamic pricing & waitlist triggers
│   ├── views_indexes.sql        # Analytics views & performance/GIN indexes
│   ├── seed.sql                 # Comprehensive seed data for venues, events, shows, seats
│   ├── queries.sql              # Complex SQL queries (JOIN, GROUP BY, HAVING, subqueries)
│   ├── alter_drop_demo.sql      # Non-destructive DDL demo script for evaluation
│   └── mongo/
│       └── setup.ts             # MongoDB collections, compound indexes, TTL indexes
├── lib/
│   ├── db/
│   │   ├── pg.ts                # PostgreSQL connection pool & transaction helper
│   │   └── mongo.ts             # MongoDB client & collection helpers
│   ├── auth/
│   │   ├── jwt.ts               # JWT signing & verification
│   │   ├── password.ts          # Bcrypt hashing & verification
│   │   └── middleware.ts        # NextRequest role guards & standard JSON envelopes
│   └── services/
│       ├── booking.ts           # Safe booking with row locking
│       ├── pricing.ts           # Dynamic pricing calculation & Mongo aggregation
│       └── waitlist.ts          # FIFO waitlist queue & promotion logic
├── docs/
│   ├── api-contract.md          # Complete API contract & JSON schemas for frontend lead
│   ├── er-diagram.md            # Mermaid ER diagram
│   ├── relational-schema.md     # Relational schema mappings & 3NF proof
│   ├── data-dictionary.md       # Full data dictionary
│   ├── mongo-data-model.md      # MongoDB collections & indexes
│   ├── db-justification.md      # SQL vs NoSQL architectural justification
│   └── test-results.md          # Test execution logs
├── scripts/
│   ├── db-init.ts               # Runs schema, triggers, and views
│   ├── db-seed.ts               # Seeds PostgreSQL
│   └── mongo-init.ts            # Sets up MongoDB indexes and sample events
├── tests/
│   └── run-all.ts               # Concurrency, constraint, pricing, and waitlist test runner
├── docker-compose.yml           # One-command PostgreSQL & MongoDB spin-up
└── .env.example                 # Environment variables template
```

---

## 3. Quickstart & Local Setup

### 3.1 Prerequisites
- **Node.js**: v18+ (tested on v22)
- **PostgreSQL**: v14+ (Local service, Docker, or Cloud PG such as Neon / Supabase)
- **MongoDB**: v6+ (Local service or Docker)

### 3.2 Running Databases via Docker (Optional)
If Docker is installed:
```bash
docker compose up -d
```
This spins up PostgreSQL on port `5432` and MongoDB on port `27017`.

### 3.3 Configure Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Adjust credentials in `.env` if your local PostgreSQL username/password differ.

### 3.4 Initialize and Seed Databases
Execute the database setup scripts:
```bash
# 1. Initialize MongoDB collections & indexes (seeds initial telemetry)
npm run mongo:init

# 2. Initialize PostgreSQL schema, stored functions, triggers, and views
npm run db:init

# 3. Seed PostgreSQL with venues, shows, seats, pricing rules, and users
npm run db:seed
```

### 3.5 Run the Development API Server
```bash
npm run dev
```
Test health check at `http://localhost:3000/api/health`.

### 3.6 Run Evaluation Tests
```bash
npm test
```

---

## 4. API Documentation
Detailed endpoint specifications, request/response JSON schemas, and authorization levels are documented in [`docs/api-contract.md`](./docs/api-contract.md).
