-- ============================================================================
-- VenueFlow - Master Seed Data
-- Multi-Venue Ticketing Platform with Dynamic Pricing & Waitlist Fulfilment
-- ============================================================================

-- Clean out existing rows in reverse foreign key order
TRUNCATE TABLE audit_log, price_history, waitlist_entries, payments, 
               booking_items, bookings, show_seats, pricing_rules, 
               shows, events, seats, venue_sections, venues, users 
RESTART IDENTITY CASCADE;

-- ----------------------------------------------------------------------------
-- 1. USERS (bcrypt hashed password: 'Password123!')
-- ----------------------------------------------------------------------------
-- Hash: $2a$10$t/OAvJnAc0X3N0AjGIr9Cuez.9IBVhmbkPTod9v2R/KRUf6naJZjm

INSERT INTO users (id, email, password_hash, full_name, phone, role) VALUES
-- Admin
(1, 'admin@venueflow.com', '$2a$10$t/OAvJnAc0X3N0AjGIr9Cuez.9IBVhmbkPTod9v2R/KRUf6naJZjm', 'Platform Administrator', '+91-9800000001', 'admin'),

-- Venue Managers
(2, 'manager.kanteerava@venueflow.com', '$2a$10$t/OAvJnAc0X3N0AjGIr9Cuez.9IBVhmbkPTod9v2R/KRUf6naJZjm', 'Vikramaditya Rao (Kanteerava)', '+91-9800000002', 'manager'),
(3, 'manager.royal@venueflow.com', '$2a$10$t/OAvJnAc0X3N0AjGIr9Cuez.9IBVhmbkPTod9v2R/KRUf6naJZjm', 'Cyrus Mistry (Royal Opera)', '+91-9800000003', 'manager'),
(4, 'manager.delhi@venueflow.com', '$2a$10$t/OAvJnAc0X3N0AjGIr9Cuez.9IBVhmbkPTod9v2R/KRUf6naJZjm', 'Rajesh Sharma (Siri Fort)', '+91-9800000004', 'manager'),

-- Customers
(5, 'arjun.sharma@example.com', '$2a$10$t/OAvJnAc0X3N0AjGIr9Cuez.9IBVhmbkPTod9v2R/KRUf6naJZjm', 'Arjun Sharma', '+91-9811111111', 'customer'),
(6, 'priya.patel@example.com', '$2a$10$t/OAvJnAc0X3N0AjGIr9Cuez.9IBVhmbkPTod9v2R/KRUf6naJZjm', 'Priya Patel', '+91-9822222222', 'customer'),
(7, 'rohit.verma@example.com', '$2a$10$t/OAvJnAc0X3N0AjGIr9Cuez.9IBVhmbkPTod9v2R/KRUf6naJZjm', 'Rohit Verma', '+91-9833333333', 'customer'),
(8, 'ananya.iyer@example.com', '$2a$10$t/OAvJnAc0X3N0AjGIr9Cuez.9IBVhmbkPTod9v2R/KRUf6naJZjm', 'Ananya Iyer', '+91-9844444444', 'customer'),
(9, 'rahul.nair@example.com', '$2a$10$t/OAvJnAc0X3N0AjGIr9Cuez.9IBVhmbkPTod9v2R/KRUf6naJZjm', 'Rahul Nair', '+91-9855555555', 'customer'),
(10, 'neha.gupta@example.com', '$2a$10$t/OAvJnAc0X3N0AjGIr9Cuez.9IBVhmbkPTod9v2R/KRUf6naJZjm', 'Neha Gupta', '+91-9866666666', 'customer'),
(11, 'vikram.singh@example.com', '$2a$10$t/OAvJnAc0X3N0AjGIr9Cuez.9IBVhmbkPTod9v2R/KRUf6naJZjm', 'Vikram Singh', '+91-9877777777', 'customer'),
(12, 'sneha.reddy@example.com', '$2a$10$t/OAvJnAc0X3N0AjGIr9Cuez.9IBVhmbkPTod9v2R/KRUf6naJZjm', 'Sneha Reddy', '+91-9888888888', 'customer');

ALTER SEQUENCE users_id_seq RESTART WITH 13;

-- ----------------------------------------------------------------------------
-- 2. VENUES
-- ----------------------------------------------------------------------------

INSERT INTO venues (id, manager_id, name, address, city, state, postal_code, total_capacity) VALUES
(1, 2, 'Kanteerava Outdoor Stadium', 'Kasturba Road, Sampangi Rama Nagar', 'Bengaluru', 'Karnataka', '560001', 60),
(2, 3, 'Royal Opera House', 'Mathew Road, Opera House, Girgaon', 'Mumbai', 'Maharashtra', '400004', 40),
(3, 4, 'Siri Fort Auditorium', 'August Kranti Marg, Siri Fort Institutional Area', 'New Delhi', 'Delhi', '110049', 30);

ALTER SEQUENCE venues_id_seq RESTART WITH 4;

-- ----------------------------------------------------------------------------
-- 3. VENUE SECTIONS
-- ----------------------------------------------------------------------------

INSERT INTO venue_sections (id, venue_id, name, base_multiplier, capacity) VALUES
-- Venue 1: Kanteerava (60 seats)
(1, 1, 'VIP', 1.50, 10),
(2, 1, 'PREMIUM', 1.25, 20),
(3, 1, 'GENERAL', 1.00, 30),

-- Venue 2: Royal Opera House (40 seats)
(4, 2, 'VIP', 1.60, 10),
(5, 2, 'BALCONY', 1.15, 30),

-- Venue 3: Siri Fort Auditorium (30 seats)
(6, 3, 'PREMIUM', 1.20, 15),
(7, 3, 'GENERAL', 1.00, 15);

ALTER SEQUENCE venue_sections_id_seq RESTART WITH 8;

-- ----------------------------------------------------------------------------
-- 4. SEATS
-- ----------------------------------------------------------------------------

-- Section 1: Venue 1 VIP (Row A: 10 seats)
INSERT INTO seats (venue_section_id, row_label, seat_number, is_accessible)
SELECT 1, 'A', s, (s = 1) FROM generate_series(1, 10) AS s;

-- Section 2: Venue 1 PREMIUM (Row B & C: 10 seats each)
INSERT INTO seats (venue_section_id, row_label, seat_number, is_accessible)
SELECT 2, 'B', s, FALSE FROM generate_series(1, 10) AS s;
INSERT INTO seats (venue_section_id, row_label, seat_number, is_accessible)
SELECT 2, 'C', s, FALSE FROM generate_series(1, 10) AS s;

-- Section 3: Venue 1 GENERAL (Row D & E: 15 seats each)
INSERT INTO seats (venue_section_id, row_label, seat_number, is_accessible)
SELECT 3, 'D', s, FALSE FROM generate_series(1, 15) AS s;
INSERT INTO seats (venue_section_id, row_label, seat_number, is_accessible)
SELECT 3, 'E', s, (s = 15) FROM generate_series(1, 15) AS s;

-- Section 4: Venue 2 VIP (Row A: 10 seats)
INSERT INTO seats (venue_section_id, row_label, seat_number, is_accessible)
SELECT 4, 'A', s, FALSE FROM generate_series(1, 10) AS s;

-- Section 5: Venue 2 BALCONY (Row B & C: 15 seats each)
INSERT INTO seats (venue_section_id, row_label, seat_number, is_accessible)
SELECT 5, 'B', s, FALSE FROM generate_series(1, 15) AS s;
INSERT INTO seats (venue_section_id, row_label, seat_number, is_accessible)
SELECT 5, 'C', s, FALSE FROM generate_series(1, 15) AS s;

-- Section 6: Venue 3 PREMIUM (Row A: 15 seats)
INSERT INTO seats (venue_section_id, row_label, seat_number, is_accessible)
SELECT 6, 'A', s, FALSE FROM generate_series(1, 15) AS s;

-- Section 7: Venue 3 GENERAL (Row B: 15 seats)
INSERT INTO seats (venue_section_id, row_label, seat_number, is_accessible)
SELECT 7, 'B', s, FALSE FROM generate_series(1, 15) AS s;

-- ----------------------------------------------------------------------------
-- 5. EVENTS
-- ----------------------------------------------------------------------------

INSERT INTO events (id, manager_id, title, description, artist, genre, duration_minutes, poster_url, is_active) VALUES
(1, 2, 'Coldplay: Music of the Spheres World Tour', 
 'Experience an electrifying stadium showcase featuring immersive laser visuals, kinetic dance floors, and Coldplay classics including Yellow, Viva La Vida, and Fix You.', 
 'Coldplay', 'Rock', 180, 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745', TRUE),

(2, 3, 'A.R. Rahman: Symphony of Dreams', 
 'An orchestral masterpiece celebrating 3 decades of musical brilliance with live symphony, sufi ensemble, and cinematic acoustics at the heritage Opera House.', 
 'A.R. Rahman', 'Classical', 150, 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819', TRUE),

(3, 2, 'Sunburn Arena EDM Electronic Fest', 
 'India’s premier electronic dance music festival showcasing international DJ sensations, hypnotic pyrotechnics, and bass-heavy anthems.', 
 'Alan Walker & Nucleya', 'Electronic', 240, 'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7', TRUE),

(4, 4, 'Shakespeare''s Hamlet Live in Theater', 
 'A hauntingly modern revival of Shakespeare''s profound tragedy exploring grief, vengeance, and morality, staged with minimalist lighting.', 
 'National Theatre Company', 'Theater', 135, 'https://images.unsplash.com/photo-1507676184212-d03ab07a01bf', TRUE);

ALTER SEQUENCE events_id_seq RESTART WITH 5;

-- ----------------------------------------------------------------------------
-- 6. SHOWS
-- ----------------------------------------------------------------------------

INSERT INTO shows (id, event_id, venue_id, start_time, end_time, base_price, status) VALUES
-- Show 1: Coldplay Night 1 (High Demand, active seats, live pricing test)
(1, 1, 1, CURRENT_TIMESTAMP + INTERVAL '14 days' + INTERVAL '19 hours', 
          CURRENT_TIMESTAMP + INTERVAL '14 days' + INTERVAL '22 hours', 3500.00, 'SCHEDULED'),

-- Show 2: Coldplay Night 2 (SOLD OUT Show: designed to demo waitlist join & promotion cascade)
(2, 1, 1, CURRENT_TIMESTAMP + INTERVAL '15 days' + INTERVAL '19 hours', 
          CURRENT_TIMESTAMP + INTERVAL '15 days' + INTERVAL '22 hours', 3500.00, 'SOLD_OUT'),

-- Show 3: A.R. Rahman at Royal Opera House
(3, 2, 2, CURRENT_TIMESTAMP + INTERVAL '21 days' + INTERVAL '18 hours', 
          CURRENT_TIMESTAMP + INTERVAL '21 days' + INTERVAL '20 hours 30 minutes', 2800.00, 'SELLING_FAST'),

-- Show 4: Sunburn Arena at Kanteerava
(4, 3, 1, CURRENT_TIMESTAMP + INTERVAL '30 days' + INTERVAL '16 hours', 
          CURRENT_TIMESTAMP + INTERVAL '30 days' + INTERVAL '20 hours', 2000.00, 'SCHEDULED'),

-- Show 5: Hamlet at Siri Fort
(5, 4, 3, CURRENT_TIMESTAMP + INTERVAL '10 days' + INTERVAL '18 hours 30 minutes', 
          CURRENT_TIMESTAMP + INTERVAL '10 days' + INTERVAL '20 hours 45 minutes', 1200.00, 'SCHEDULED');

ALTER SEQUENCE shows_id_seq RESTART WITH 6;

-- ----------------------------------------------------------------------------
-- 7. PRICING RULES (1:1 with Shows)
-- ----------------------------------------------------------------------------

INSERT INTO pricing_rules (show_id, min_price, max_price, demand_factor_weight, view_weight, search_weight, abandon_weight) VALUES
(1, 3000.00, 7500.00, 0.40, 0.05, 0.10, 0.08),
(2, 3000.00, 8000.00, 0.45, 0.05, 0.10, 0.10),
(3, 2500.00, 6000.00, 0.35, 0.05, 0.08, 0.06),
(4, 1800.00, 4500.00, 0.30, 0.04, 0.08, 0.05),
(5, 1000.00, 2500.00, 0.25, 0.03, 0.05, 0.04);

-- ----------------------------------------------------------------------------
-- 8. INSTANTIATE SHOW SEATS
-- ----------------------------------------------------------------------------

-- Populate Show 1 with all 60 seats of Venue 1 (Kanteerava)
INSERT INTO show_seats (show_id, seat_id, status)
SELECT 1, s.id, 'AVAILABLE'
FROM seats s
JOIN venue_sections vs ON s.venue_section_id = vs.id
WHERE vs.venue_id = 1;

-- Populate Show 2 (Sold out show) with all 60 seats of Venue 1
INSERT INTO show_seats (show_id, seat_id, status)
SELECT 2, s.id, 'BOOKED'
FROM seats s
JOIN venue_sections vs ON s.venue_section_id = vs.id
WHERE vs.venue_id = 1;

-- Populate Show 3 with all 40 seats of Venue 2 (Royal Opera)
INSERT INTO show_seats (show_id, seat_id, status)
SELECT 3, s.id, 'AVAILABLE'
FROM seats s
JOIN venue_sections vs ON s.venue_section_id = vs.id
WHERE vs.venue_id = 2;

-- Populate Show 4 with all 60 seats of Venue 1
INSERT INTO show_seats (show_id, seat_id, status)
SELECT 4, s.id, 'AVAILABLE'
FROM seats s
JOIN venue_sections vs ON s.venue_section_id = vs.id
WHERE vs.venue_id = 1;

-- Populate Show 5 with all 30 seats of Venue 3 (Siri Fort)
INSERT INTO show_seats (show_id, seat_id, status)
SELECT 5, s.id, 'AVAILABLE'
FROM seats s
JOIN venue_sections vs ON s.venue_section_id = vs.id
WHERE vs.venue_id = 3;

-- ----------------------------------------------------------------------------
-- 9. SEED REALISTIC OCCUPANCY & BOOKINGS FOR SHOW 1 & SHOW 2
-- ----------------------------------------------------------------------------

-- Show 1: Book seats 1 to 20 for Arjun and Priya (33% initial occupancy)
INSERT INTO bookings (id, user_id, show_id, booking_reference, total_amount, status) VALUES
(1, 5, 1, 'BK-SHOW1-ARJUN-001', 10500.00, 'CONFIRMED'),
(2, 6, 1, 'BK-SHOW1-PRIYA-002', 8750.00, 'CONFIRMED');

-- Update status in show_seats for Show 1
UPDATE show_seats SET status = 'BOOKED' WHERE show_id = 1 AND seat_id BETWEEN 1 AND 4;

-- Booking items for Show 1
INSERT INTO booking_items (booking_id, show_seat_id, price_paid)
SELECT 1, id, 5250.00 FROM show_seats WHERE show_id = 1 AND seat_id IN (1, 2);

INSERT INTO booking_items (booking_id, show_seat_id, price_paid)
SELECT 2, id, 4375.00 FROM show_seats WHERE show_id = 1 AND seat_id IN (3, 4);

-- Payments for Show 1
INSERT INTO payments (booking_id, transaction_reference, amount, payment_method, payment_status, provider_response) VALUES
(1, 'TXN-SIM-COLDPLAY-001', 10500.00, 'CREDIT_CARD', 'SUCCESS', '{"gateway": "HDFC", "auth_code": "AUTH9812"}'),
(2, 'TXN-SIM-COLDPLAY-002', 8750.00, 'UPI', 'SUCCESS', '{"gateway": "Razorpay", "upi_vpa": "priya@okhdfc"}');

-- Also put 2 seats on temporary HOLD in Show 1 (held by Rohit Verma, expiring in 10 mins)
UPDATE show_seats 
SET status = 'HELD', held_by = 7, hold_expires_at = CURRENT_TIMESTAMP + INTERVAL '10 minutes'
WHERE show_id = 1 AND seat_id IN (5, 6);

-- Show 2 (Sold Out Show): Create a representative booking that can be CANCELLED during viva demo
INSERT INTO bookings (id, user_id, show_id, booking_reference, total_amount, status) VALUES
(3, 7, 2, 'BK-SHOW2-ROHIT-DEMO', 7000.00, 'CONFIRMED');

-- Link 2 seats of Show 2 to this booking
INSERT INTO booking_items (booking_id, show_seat_id, price_paid)
SELECT 3, id, 3500.00 FROM show_seats WHERE show_id = 2 AND seat_id IN (1, 2);

INSERT INTO payments (booking_id, transaction_reference, amount, payment_method, payment_status, provider_response) VALUES
(3, 'TXN-SIM-SHOW2-DEMO-003', 7000.00, 'NET_BANKING', 'SUCCESS', '{"gateway": "ICICI", "auth_code": "NET9021"}');

ALTER SEQUENCE bookings_id_seq RESTART WITH 4;

-- ----------------------------------------------------------------------------
-- 10. WAITLIST ENTRIES FOR SHOW 2 (Sold out show demo)
-- ----------------------------------------------------------------------------

INSERT INTO waitlist_entries (show_id, user_id, requested_quantity, position, status, promoted_until) VALUES
-- Ananya Iyer: Position 1 waiting for 2 tickets
(2, 8, 2, 1, 'WAITING', NULL),
-- Rahul Nair: Position 2 waiting for 1 ticket
(2, 9, 1, 2, 'WAITING', NULL),
-- Neha Gupta: Position 3 waiting for 2 tickets
(2, 10, 2, 3, 'WAITING', NULL);

-- ----------------------------------------------------------------------------
-- 11. PRICE HISTORY BASELINE LOGS
-- ----------------------------------------------------------------------------

INSERT INTO price_history (show_id, old_price, new_price, reason) VALUES
(1, 3500.00, 3500.00, 'Initial base price set at schedule creation'),
(2, 3500.00, 4800.00, 'Dynamic price surge: 100% occupancy threshold reached'),
(3, 2800.00, 3100.00, 'Demand surge based on search and page view velocity');
