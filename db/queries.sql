-- ============================================================================
-- VenueFlow - Analytical & Complex SQL Queries
-- Course Requirement: Queries demonstrating JOIN, GROUP BY, HAVING, ORDER BY,
-- aggregates, subqueries, CTEs, and window functions. Each query is commented
-- with its specific academic purpose and business logic explanation.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- QUERY 1: Multi-Table JOIN with Multi-Level Aggregates
-- Purpose: Calculate gross revenue, total tickets sold, and average ticket price
-- per venue and music/event genre.
-- Demonstrates: Multi-table INNER JOIN, GROUP BY on multiple columns, SUM, COUNT,
-- AVG aggregates, and ORDER BY.
-- ----------------------------------------------------------------------------
SELECT 
    v.name AS venue_name,
    v.city,
    e.genre,
    COUNT(DISTINCT s.id) AS shows_hosted,
    COUNT(bi.id) AS total_tickets_sold,
    COALESCE(SUM(bi.price_paid), 0.00) AS total_gross_revenue,
    COALESCE(ROUND(AVG(bi.price_paid), 2), 0.00) AS avg_ticket_price_realized
FROM venues v
JOIN shows s ON v.id = s.venue_id
JOIN events e ON s.event_id = e.id
LEFT JOIN bookings b ON s.id = b.show_id AND b.status = 'CONFIRMED'
LEFT JOIN booking_items bi ON b.id = bi.booking_id
GROUP BY v.name, v.city, e.genre
ORDER BY total_gross_revenue DESC, total_tickets_sold DESC;


-- ----------------------------------------------------------------------------
-- QUERY 2: GROUP BY with HAVING Clause Filter
-- Purpose: Identify venues that demonstrate high occupancy performance
-- (venues whose average show occupancy exceeds 50%).
-- Demonstrates: Aggregating computed expressions, NULLIF handling, and HAVING filter.
-- ----------------------------------------------------------------------------
SELECT 
    v.id AS venue_id,
    v.name AS venue_name,
    v.city,
    COUNT(DISTINCT s.id) AS total_shows,
    COUNT(ss.id) AS total_seat_instances,
    COUNT(ss.id) FILTER (WHERE ss.status = 'BOOKED') AS total_booked_seats,
    ROUND(
        (COUNT(ss.id) FILTER (WHERE ss.status = 'BOOKED')::NUMERIC / 
         NULLIF(COUNT(ss.id), 0)::NUMERIC) * 100, 
        2
    ) AS venue_occupancy_percentage
FROM venues v
JOIN shows s ON v.id = s.venue_id
JOIN show_seats ss ON s.id = ss.show_id
GROUP BY v.id, v.name, v.city
HAVING (
    COUNT(ss.id) FILTER (WHERE ss.status = 'BOOKED')::NUMERIC / 
    NULLIF(COUNT(ss.id), 0)::NUMERIC
) > 0.50
ORDER BY venue_occupancy_percentage DESC;


-- ----------------------------------------------------------------------------
-- QUERY 3: Correlated Subquery in WHERE Clause
-- Purpose: High-roller customer segmentation: find customers whose total spending
-- exceeds the average customer spend across the entire ticketing platform.
-- Demonstrates: Correlated aggregation and nested subquery comparison.
-- ----------------------------------------------------------------------------
SELECT 
    u.id AS customer_id,
    u.full_name,
    u.email,
    COUNT(b.id) AS confirmed_bookings,
    SUM(b.total_amount) AS total_spent
FROM users u
JOIN bookings b ON u.id = b.user_id
WHERE b.status = 'CONFIRMED'
GROUP BY u.id, u.full_name, u.email
HAVING SUM(b.total_amount) > (
    -- Subquery: Platform-wide average spend per paying customer
    SELECT AVG(customer_spend)
    FROM (
        SELECT SUM(b2.total_amount) AS customer_spend
        FROM bookings b2
        WHERE b2.status = 'CONFIRMED'
        GROUP BY b2.user_id
    ) AS platform_spenders
)
ORDER BY total_spent DESC;


-- ----------------------------------------------------------------------------
-- QUERY 4: Window Function (DENSE_RANK over Partitions)
-- Purpose: Rank shows by revenue within their respective host cities.
-- Demonstrates: Window function DENSE_RANK() OVER (PARTITION BY ... ORDER BY ...).
-- ----------------------------------------------------------------------------
SELECT 
    v.city,
    e.title AS event_title,
    s.id AS show_id,
    s.start_time,
    COALESCE(SUM(bi.price_paid), 0.00) AS show_revenue,
    DENSE_RANK() OVER (
        PARTITION BY v.city 
        ORDER BY COALESCE(SUM(bi.price_paid), 0.00) DESC
    ) AS city_revenue_rank
FROM shows s
JOIN events e ON s.event_id = e.id
JOIN venues v ON s.venue_id = v.id
LEFT JOIN bookings b ON s.id = b.show_id AND b.status = 'CONFIRMED'
LEFT JOIN booking_items bi ON b.id = bi.booking_id
GROUP BY v.city, e.title, s.id, s.start_time
ORDER BY v.city, city_revenue_rank ASC;


-- ----------------------------------------------------------------------------
-- QUERY 5: Window Function (Running Cumulative Total)
-- Purpose: Track the day-by-day revenue velocity and cumulative revenue growth.
-- Demonstrates: SUM(...) OVER (ORDER BY ... ROWS BETWEEN UNBOUNDED PRECEDING...).
-- ----------------------------------------------------------------------------
SELECT 
    DATE(b.created_at) AS booking_date,
    COUNT(b.id) AS daily_bookings_count,
    SUM(b.total_amount) AS daily_revenue,
    SUM(SUM(b.total_amount)) OVER (
        ORDER BY DATE(b.created_at) 
        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    ) AS cumulative_platform_revenue
FROM bookings b
WHERE b.status = 'CONFIRMED'
GROUP BY DATE(b.created_at)
ORDER BY booking_date ASC;


-- ----------------------------------------------------------------------------
-- QUERY 6: Full-Text Search with Relevance Scoring
-- Purpose: Search event catalog by keywords ('Coldplay', 'Rock', 'Live')
-- using tsvector matching and ts_rank ordering.
-- Demonstrates: GIN-indexed tsvector @@ plainto_tsquery and ts_rank ranking.
-- ----------------------------------------------------------------------------
SELECT 
    e.id,
    e.title,
    e.artist,
    e.genre,
    e.description,
    ROUND(ts_rank(e.search_vector, plainto_tsquery('english', 'Coldplay Rock Stadium'))::NUMERIC, 4) AS relevance_score
FROM events e
WHERE e.search_vector @@ plainto_tsquery('english', 'Coldplay Rock Stadium')
ORDER BY relevance_score DESC;


-- ----------------------------------------------------------------------------
-- QUERY 7: Anti-Join Subquery (NOT EXISTS)
-- Purpose: Identify demand friction: users who joined a waitlist but have NEVER
-- successfully completed any booking on the platform.
-- Demonstrates: NOT EXISTS correlated subquery with foreign key relationship.
-- ----------------------------------------------------------------------------
SELECT 
    u.id AS user_id,
    u.full_name,
    u.email,
    we.show_id,
    we.requested_quantity,
    we.position,
    we.status AS waitlist_status
FROM waitlist_entries we
JOIN users u ON we.user_id = u.id
WHERE NOT EXISTS (
    SELECT 1 
    FROM bookings b 
    WHERE b.user_id = u.id AND b.status = 'CONFIRMED'
)
ORDER BY we.created_at ASC;


-- ----------------------------------------------------------------------------
-- QUERY 8: Common Table Expression (CTE) for Seating Section Yield
-- Purpose: Analyze which seating section tier (VIP vs Premium vs General)
-- produces the highest financial revenue yield relative to its allocated capacity.
-- Demonstrates: Multi-stage CTE (WITH clause) combined with final aggregated metrics.
-- ----------------------------------------------------------------------------
WITH section_revenue_summary AS (
    SELECT 
        vs.name AS section_name,
        COUNT(DISTINCT vs.id) AS section_count,
        SUM(vs.capacity) AS total_physical_capacity,
        COUNT(bi.id) AS seats_sold,
        COALESCE(SUM(bi.price_paid), 0.00) AS total_yield
    FROM venue_sections vs
    LEFT JOIN seats s ON vs.id = s.venue_section_id
    LEFT JOIN show_seats ss ON s.id = ss.seat_id
    LEFT JOIN booking_items bi ON ss.id = bi.show_seat_id
    GROUP BY vs.name
)
SELECT 
    section_name,
    total_physical_capacity,
    seats_sold,
    total_yield,
    ROUND(
        total_yield / NULLIF(total_physical_capacity, 0)::NUMERIC, 
        2
    ) AS revenue_per_available_seat
FROM section_revenue_summary
ORDER BY revenue_per_available_seat DESC;


-- ----------------------------------------------------------------------------
-- QUERY 9: Urgent Selling Shows (Selling Fast Filter)
-- Purpose: Real-time discovery query: find upcoming shows occurring in the next
-- 30 days that have fewer than 20% available seats left.
-- Demonstrates: Date arithmetic, conditional aggregates, and percentage threshold.
-- ----------------------------------------------------------------------------
SELECT 
    s.id AS show_id,
    e.title AS event_title,
    v.name AS venue_name,
    v.city,
    s.start_time,
    s.base_price,
    COUNT(ss.id) AS total_seats,
    COUNT(ss.id) FILTER (WHERE ss.status = 'AVAILABLE') AS available_seats,
    ROUND(
        (COUNT(ss.id) FILTER (WHERE ss.status = 'AVAILABLE')::NUMERIC / 
         NULLIF(COUNT(ss.id), 0)::NUMERIC) * 100, 
        1
    ) AS available_pct
FROM shows s
JOIN events e ON s.event_id = e.id
JOIN venues v ON s.venue_id = v.id
JOIN show_seats ss ON s.id = ss.show_id
WHERE s.start_time BETWEEN CURRENT_TIMESTAMP AND CURRENT_TIMESTAMP + INTERVAL '30 days'
  AND s.status != 'CANCELLED'
GROUP BY s.id, e.title, v.name, v.city, s.start_time, s.base_price
HAVING (
    COUNT(ss.id) FILTER (WHERE ss.status = 'AVAILABLE')::NUMERIC / 
    NULLIF(COUNT(ss.id), 0)::NUMERIC
) < 0.20
ORDER BY available_pct ASC;


-- ----------------------------------------------------------------------------
-- QUERY 10: Dynamic Pricing Audit & Surge Frequency
-- Purpose: Audit how frequently dynamic pricing has intervened for each show
-- and calculate the average price increase over the original base price.
-- Demonstrates: Self-join on historical ledger, AVG difference, and MAX price surge.
-- ----------------------------------------------------------------------------
SELECT 
    s.id AS show_id,
    e.title AS event_title,
    s.base_price,
    COUNT(ph.id) AS price_adjustments_count,
    ROUND(AVG(ph.new_price - s.base_price), 2) AS avg_surge_amount,
    MAX(ph.new_price) AS peak_dynamic_price,
    ROUND(((MAX(ph.new_price) - s.base_price) / s.base_price) * 100, 1) AS max_surge_percentage
FROM shows s
JOIN events e ON s.event_id = e.id
JOIN price_history ph ON s.id = ph.show_id
GROUP BY s.id, e.title, s.base_price
ORDER BY price_adjustments_count DESC;
