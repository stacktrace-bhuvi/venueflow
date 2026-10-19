-- ============================================================================
-- VenueFlow - Relational Schema DDL
-- Multi-Venue Ticketing Platform with Demand-Driven Dynamic Pricing & Waitlists
-- Target: PostgreSQL 14+
-- ============================================================================

-- Clean teardown in reverse dependency order
DROP TABLE IF EXISTS audit_log CASCADE;
DROP TABLE IF EXISTS price_history CASCADE;
DROP TABLE IF EXISTS waitlist_entries CASCADE;
DROP TABLE IF EXISTS payments CASCADE;
DROP TABLE IF EXISTS booking_items CASCADE;
DROP TABLE IF EXISTS bookings CASCADE;
DROP TABLE IF EXISTS show_seats CASCADE;
DROP TABLE IF EXISTS pricing_rules CASCADE;
DROP TABLE IF EXISTS shows CASCADE;
DROP TABLE IF EXISTS events CASCADE;
DROP TABLE IF EXISTS seats CASCADE;
DROP TABLE IF EXISTS venue_sections CASCADE;
DROP TABLE IF EXISTS venues CASCADE;
DROP TABLE IF EXISTS users CASCADE;

DROP TYPE IF EXISTS waitlist_status CASCADE;
DROP TYPE IF EXISTS payment_status CASCADE;
DROP TYPE IF EXISTS payment_method CASCADE;
DROP TYPE IF EXISTS booking_status CASCADE;
DROP TYPE IF EXISTS seat_status CASCADE;
DROP TYPE IF EXISTS show_status CASCADE;
DROP TYPE IF EXISTS seat_section CASCADE;
DROP TYPE IF EXISTS user_role CASCADE;

-- ============================================================================
-- 1. ENUMS (Domain-level integrity checking)
-- ============================================================================

CREATE TYPE user_role AS ENUM ('customer', 'manager', 'admin');
CREATE TYPE seat_section AS ENUM ('VIP', 'PREMIUM', 'GENERAL', 'BALCONY');
CREATE TYPE show_status AS ENUM ('SCHEDULED', 'SELLING_FAST', 'SOLD_OUT', 'COMPLETED', 'CANCELLED');
CREATE TYPE seat_status AS ENUM ('AVAILABLE', 'HELD', 'BOOKED');
CREATE TYPE booking_status AS ENUM ('CONFIRMED', 'CANCELLED', 'REFUNDED');
CREATE TYPE payment_method AS ENUM ('CREDIT_CARD', 'DEBIT_CARD', 'UPI', 'NET_BANKING');
CREATE TYPE payment_status AS ENUM ('SUCCESS', 'FAILED', 'REFUNDED');
CREATE TYPE waitlist_status AS ENUM ('WAITING', 'PROMOTED', 'EXPIRED', 'FULFILLED', 'CANCELLED');

-- ============================================================================
-- 2. USERS & ACCESS CONTROL
-- ============================================================================

CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(120) NOT NULL,
    phone VARCHAR(30),
    role user_role NOT NULL DEFAULT 'customer',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_users_email_format CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')
);

-- ============================================================================
-- 3. VENUES & SEATING GEOMETRY
-- ============================================================================

CREATE TABLE venues (
    id SERIAL PRIMARY KEY,
    manager_id INT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    name VARCHAR(150) NOT NULL,
    address VARCHAR(255) NOT NULL,
    city VARCHAR(80) NOT NULL,
    state VARCHAR(80) NOT NULL,
    postal_code VARCHAR(20) NOT NULL,
    total_capacity INT NOT NULL CHECK (total_capacity > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE venue_sections (
    id SERIAL PRIMARY KEY,
    venue_id INT NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
    name seat_section NOT NULL,
    base_multiplier NUMERIC(4, 2) NOT NULL DEFAULT 1.00 CHECK (base_multiplier >= 1.00),
    capacity INT NOT NULL CHECK (capacity > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_venue_section UNIQUE (venue_id, name)
);

CREATE TABLE seats (
    id SERIAL PRIMARY KEY,
    venue_section_id INT NOT NULL REFERENCES venue_sections(id) ON DELETE CASCADE,
    row_label VARCHAR(10) NOT NULL,
    seat_number INT NOT NULL CHECK (seat_number > 0),
    is_accessible BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_section_row_seat UNIQUE (venue_section_id, row_label, seat_number)
);

-- ============================================================================
-- 4. EVENTS & SHOWS
-- ============================================================================

CREATE TABLE events (
    id SERIAL PRIMARY KEY,
    manager_id INT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    title VARCHAR(200) NOT NULL,
    description TEXT NOT NULL,
    artist VARCHAR(150) NOT NULL,
    genre VARCHAR(60) NOT NULL,
    duration_minutes INT NOT NULL CHECK (duration_minutes > 0),
    poster_url TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    -- Full-Text Search tsvector column generated automatically
    search_vector tsvector GENERATED ALWAYS AS (
        setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(artist, '')), 'B') ||
        setweight(to_tsvector('english', coalesce(genre, '')), 'B') ||
        setweight(to_tsvector('english', coalesce(description, '')), 'C')
    ) STORED,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE shows (
    id SERIAL PRIMARY KEY,
    event_id INT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    venue_id INT NOT NULL REFERENCES venues(id) ON DELETE RESTRICT,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    base_price NUMERIC(10, 2) NOT NULL CHECK (base_price > 0),
    status show_status NOT NULL DEFAULT 'SCHEDULED',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_show_time_range CHECK (end_time > start_time)
);

-- ============================================================================
-- 5. DYNAMIC PRICING RULES (1:1 with Shows)
-- ============================================================================

CREATE TABLE pricing_rules (
    id SERIAL PRIMARY KEY,
    show_id INT NOT NULL UNIQUE REFERENCES shows(id) ON DELETE CASCADE,
    min_price NUMERIC(10, 2) NOT NULL CHECK (min_price > 0),
    max_price NUMERIC(10, 2) NOT NULL,
    demand_factor_weight NUMERIC(4, 2) NOT NULL DEFAULT 0.35 CHECK (demand_factor_weight >= 0),
    view_weight NUMERIC(4, 2) NOT NULL DEFAULT 0.05 CHECK (view_weight >= 0),
    search_weight NUMERIC(4, 2) NOT NULL DEFAULT 0.10 CHECK (search_weight >= 0),
    abandon_weight NUMERIC(4, 2) NOT NULL DEFAULT 0.08 CHECK (abandon_weight >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_pricing_rule_bounds CHECK (max_price >= min_price)
);

-- ============================================================================
-- 6. SHOW SEATS (Seat instance per Show + Pessimistic Concurrency Lock)
-- ============================================================================

CREATE TABLE show_seats (
    id SERIAL PRIMARY KEY,
    show_id INT NOT NULL REFERENCES shows(id) ON DELETE CASCADE,
    seat_id INT NOT NULL REFERENCES seats(id) ON DELETE CASCADE,
    status seat_status NOT NULL DEFAULT 'AVAILABLE',
    held_by INT REFERENCES users(id) ON DELETE SET NULL,
    hold_expires_at TIMESTAMPTZ,
    version INT NOT NULL DEFAULT 1,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_show_seat UNIQUE (show_id, seat_id),
    -- Domain rule: HELD status requires a valid user and expiration timestamp
    CONSTRAINT chk_hold_integrity CHECK (
        (status = 'HELD' AND held_by IS NOT NULL AND hold_expires_at IS NOT NULL) OR
        (status != 'HELD')
    )
);

-- ============================================================================
-- 7. BOOKINGS & PAYMENTS (Transactional Financial Ledger)
-- ============================================================================

CREATE TABLE bookings (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    show_id INT NOT NULL REFERENCES shows(id) ON DELETE RESTRICT,
    booking_reference VARCHAR(32) NOT NULL UNIQUE,
    total_amount NUMERIC(10, 2) NOT NULL CHECK (total_amount >= 0),
    status booking_status NOT NULL DEFAULT 'CONFIRMED',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE booking_items (
    id SERIAL PRIMARY KEY,
    booking_id INT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    show_seat_id INT NOT NULL UNIQUE REFERENCES show_seats(id) ON DELETE RESTRICT,
    price_paid NUMERIC(10, 2) NOT NULL CHECK (price_paid >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE payments (
    id SERIAL PRIMARY KEY,
    booking_id INT NOT NULL UNIQUE REFERENCES bookings(id) ON DELETE CASCADE,
    transaction_reference VARCHAR(64) NOT NULL UNIQUE,
    amount NUMERIC(10, 2) NOT NULL CHECK (amount >= 0),
    payment_method payment_method NOT NULL DEFAULT 'CREDIT_CARD',
    payment_status payment_status NOT NULL DEFAULT 'SUCCESS',
    provider_response JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- 8. WAITLIST FIFO SYSTEM
-- ============================================================================

CREATE TABLE waitlist_entries (
    id SERIAL PRIMARY KEY,
    show_id INT NOT NULL REFERENCES shows(id) ON DELETE CASCADE,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    requested_quantity INT NOT NULL CHECK (requested_quantity BETWEEN 1 AND 10),
    position INT NOT NULL CHECK (position > 0),
    status waitlist_status NOT NULL DEFAULT 'WAITING',
    promoted_until TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- 9. AUDIT & PRICE HISTORY (Advanced DB Concept)
-- ============================================================================

CREATE TABLE price_history (
    id SERIAL PRIMARY KEY,
    show_id INT NOT NULL REFERENCES shows(id) ON DELETE CASCADE,
    old_price NUMERIC(10, 2) NOT NULL,
    new_price NUMERIC(10, 2) NOT NULL,
    reason VARCHAR(150) NOT NULL,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE audit_log (
    id SERIAL PRIMARY KEY,
    table_name VARCHAR(50) NOT NULL,
    record_id INT NOT NULL,
    action VARCHAR(20) NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
    changed_by INT,
    old_data JSONB,
    new_data JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- 10. INDEXES (B-Tree, Partial Unique, Full-Text GIN)
-- ============================================================================

-- A. Advanced Concept: Partial Unique Index
-- Guarantees at the physical storage engine level that a seat can NEVER be BOOKED
-- more than once for the same show under any concurrency condition.
CREATE UNIQUE INDEX idx_show_seats_unique_booked 
    ON show_seats (show_id, seat_id) 
    WHERE (status = 'BOOKED');

-- Guarantees at most one active HOLD per seat per show
CREATE UNIQUE INDEX idx_show_seats_unique_held 
    ON show_seats (show_id, seat_id) 
    WHERE (status = 'HELD');

-- B. Advanced Concept: GIN Index on Generated tsvector for Full-Text Search
CREATE INDEX idx_events_fts 
    ON events USING GIN (search_vector);

-- C. Performance B-tree Indexes for Join and Filter Paths
CREATE INDEX idx_shows_event_venue ON shows (event_id, venue_id);
CREATE INDEX idx_shows_start_time ON shows (start_time);
CREATE INDEX idx_show_seats_lookup ON show_seats (show_id, status);
CREATE INDEX idx_show_seats_hold_expiry ON show_seats (hold_expires_at) WHERE status = 'HELD';
CREATE INDEX idx_bookings_user ON bookings (user_id, created_at DESC);
CREATE INDEX idx_bookings_show ON bookings (show_id);
CREATE INDEX idx_waitlist_show_queue ON waitlist_entries (show_id, position) WHERE status = 'WAITING';
CREATE INDEX idx_waitlist_promoted ON waitlist_entries (promoted_until) WHERE status = 'PROMOTED';
CREATE INDEX idx_price_history_show ON price_history (show_id, recorded_at DESC);
CREATE INDEX idx_audit_log_target ON audit_log (table_name, record_id);
