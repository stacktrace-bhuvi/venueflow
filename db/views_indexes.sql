-- ============================================================================
-- VenueFlow - Views & Specialized Analytical Views
-- Target: PostgreSQL 14+
-- ============================================================================

DROP VIEW IF EXISTS manager_dashboard_view CASCADE;
DROP VIEW IF EXISTS revenue_by_event_view CASCADE;
DROP VIEW IF EXISTS show_occupancy_view CASCADE;

-- ============================================================================
-- 1. VIEW: Show Occupancy & Inventory Metrics
-- ============================================================================
-- Consolidates inventory state across seats and shows, computing real-time
-- occupancy percentages and availability counts for discovery and pricing.

CREATE OR REPLACE VIEW show_occupancy_view AS
SELECT 
    s.id AS show_id,
    e.id AS event_id,
    e.title AS event_title,
    e.genre,
    v.id AS venue_id,
    v.name AS venue_name,
    v.city AS venue_city,
    s.start_time,
    s.end_time,
    s.base_price,
    s.status AS show_status,
    COUNT(ss.id) AS total_capacity,
    COUNT(ss.id) FILTER (WHERE ss.status = 'BOOKED') AS booked_seats,
    COUNT(ss.id) FILTER (WHERE ss.status = 'HELD') AS held_seats,
    COUNT(ss.id) FILTER (WHERE ss.status = 'AVAILABLE') AS available_seats,
    ROUND(
        (COUNT(ss.id) FILTER (WHERE ss.status IN ('BOOKED', 'HELD'))::NUMERIC / 
         NULLIF(COUNT(ss.id), 0)::NUMERIC) * 100, 
        2
    ) AS occupancy_percentage
FROM shows s
JOIN events e ON s.event_id = e.id
JOIN venues v ON s.venue_id = v.id
LEFT JOIN show_seats ss ON s.id = ss.show_id
GROUP BY s.id, e.id, e.title, e.genre, v.id, v.name, v.city, s.start_time, s.end_time, s.base_price, s.status;

-- ============================================================================
-- 2. VIEW: Revenue by Event & Organizer
-- ============================================================================
-- Calculates gross revenue, refunded amounts, and net financial yield per event
-- by joining bookings, line items, and payment transactions.

CREATE OR REPLACE VIEW revenue_by_event_view AS
SELECT 
    e.id AS event_id,
    e.title AS event_title,
    e.artist,
    e.genre,
    u.id AS manager_id,
    u.full_name AS organizer_name,
    COUNT(DISTINCT s.id) AS total_shows_scheduled,
    COUNT(DISTINCT b.id) FILTER (WHERE b.status = 'CONFIRMED') AS confirmed_bookings_count,
    COUNT(bi.id) FILTER (WHERE b.status = 'CONFIRMED') AS tickets_sold_count,
    COALESCE(SUM(bi.price_paid) FILTER (WHERE b.status = 'CONFIRMED'), 0.00) AS gross_revenue,
    COALESCE(SUM(b.total_amount) FILTER (WHERE b.status = 'CANCELLED'), 0.00) AS refunded_revenue,
    COALESCE(
        SUM(bi.price_paid) FILTER (WHERE b.status = 'CONFIRMED') - 
        COALESCE(SUM(b.total_amount) FILTER (WHERE b.status = 'CANCELLED'), 0.00), 
        0.00
    ) AS net_revenue
FROM events e
JOIN users u ON e.manager_id = u.id
LEFT JOIN shows s ON e.id = s.event_id
LEFT JOIN bookings b ON s.id = b.show_id
LEFT JOIN booking_items bi ON b.id = bi.booking_id
GROUP BY e.id, e.title, e.artist, e.genre, u.id, u.full_name;

-- ============================================================================
-- 3. VIEW: Manager Dashboard Operational Summary
-- ============================================================================
-- Provides a single analytical view for venue managers to inspect total
-- attendance, revenue, average occupancy, and active waitlist queues.

CREATE OR REPLACE VIEW manager_dashboard_view AS
SELECT 
    v.id AS venue_id,
    v.name AS venue_name,
    v.city AS venue_city,
    v.manager_id,
    u.full_name AS manager_name,
    COUNT(DISTINCT s.id) AS total_shows,
    COUNT(DISTINCT b.id) FILTER (WHERE b.status = 'CONFIRMED') AS total_confirmed_bookings,
    COALESCE(SUM(bi.price_paid) FILTER (WHERE b.status = 'CONFIRMED'), 0.00) AS total_ticket_revenue,
    ROUND(
        AVG(
            CASE 
                WHEN sov.total_capacity > 0 THEN sov.occupancy_percentage 
                ELSE 0 
            END
        ), 
        2
    ) AS average_show_occupancy_pct,
    COUNT(DISTINCT we.id) FILTER (WHERE we.status = 'WAITING') AS active_waiting_customers
FROM venues v
JOIN users u ON v.manager_id = u.id
LEFT JOIN shows s ON v.id = s.venue_id
LEFT JOIN show_occupancy_view sov ON s.id = sov.show_id
LEFT JOIN bookings b ON s.id = b.show_id
LEFT JOIN booking_items bi ON b.id = bi.booking_id
LEFT JOIN waitlist_entries we ON s.id = we.show_id
GROUP BY v.id, v.name, v.city, v.manager_id, u.full_name;
