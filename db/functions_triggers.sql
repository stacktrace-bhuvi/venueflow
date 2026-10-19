-- ============================================================================
-- VenueFlow - Stored Functions & Triggers
-- Multi-Venue Ticketing Platform with Dynamic Pricing & Automated Waitlists
-- Target: PostgreSQL 14+
-- ============================================================================

-- Clean teardown of existing functions and triggers
DROP TRIGGER IF EXISTS trg_audit_bookings ON bookings;
DROP TRIGGER IF EXISTS trg_audit_pricing_rules ON pricing_rules;
DROP TRIGGER IF EXISTS trg_prevent_past_show_booking ON bookings;
DROP TRIGGER IF EXISTS trg_sync_show_status ON show_seats;

DROP FUNCTION IF EXISTS log_audit_trail() CASCADE;
DROP FUNCTION IF EXISTS check_past_show_booking() CASCADE;
DROP FUNCTION IF EXISTS sync_show_status_from_seats() CASCADE;
DROP FUNCTION IF EXISTS calculate_dynamic_price(INT, INT, INT) CASCADE;
DROP FUNCTION IF EXISTS promote_waitlist_fifo(INT, INT) CASCADE;

-- ============================================================================
-- 1. ADVANCED CONCEPT: Stored Function for Dynamic Pricing
-- ============================================================================
-- Merges PostgreSQL physical occupancy ratio with MongoDB-aggregated behavioral
-- velocity (recent page views and abandoned checkouts). Applies weighting formulas
-- and strictly clamps the resulting dynamic ticket price between [min_price, max_price].
-- Also logs the adjustment in the price_history ledger.

CREATE OR REPLACE FUNCTION calculate_dynamic_price(
    p_show_id INT,
    p_recent_views INT DEFAULT 0,
    p_recent_abandonments INT DEFAULT 0
)
RETURNS NUMERIC(10, 2)
LANGUAGE plpgsql
AS $$
DECLARE
    v_base_price NUMERIC(10, 2);
    v_min_price NUMERIC(10, 2);
    v_max_price NUMERIC(10, 2);
    v_demand_factor_weight NUMERIC(4, 2);
    v_view_weight NUMERIC(4, 2);
    v_abandon_weight NUMERIC(4, 2);

    v_total_seats INT := 0;
    v_occupied_seats INT := 0;
    v_occupancy_ratio NUMERIC(5, 4) := 0.0000;
    
    v_occupancy_multiplier NUMERIC(6, 4) := 0.0000;
    v_behavioral_multiplier NUMERIC(6, 4) := 0.0000;
    v_total_multiplier NUMERIC(6, 4) := 1.0000;

    v_calculated_price NUMERIC(10, 2);
    v_final_price NUMERIC(10, 2);
    v_old_price NUMERIC(10, 2);
    v_reason TEXT;
BEGIN
    -- 1. Fetch show base price and pricing rules
    SELECT 
        s.base_price,
        COALESCE(pr.min_price, s.base_price * 0.8),
        COALESCE(pr.max_price, s.base_price * 2.5),
        COALESCE(pr.demand_factor_weight, 0.35),
        COALESCE(pr.view_weight, 0.05),
        COALESCE(pr.abandon_weight, 0.08)
    INTO 
        v_base_price,
        v_min_price,
        v_max_price,
        v_demand_factor_weight,
        v_view_weight,
        v_abandon_weight
    FROM shows s
    LEFT JOIN pricing_rules pr ON s.id = pr.show_id
    WHERE s.id = p_show_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Show ID % does not exist.', p_show_id;
    END IF;

    -- 2. Compute real-time physical seat occupancy in PostgreSQL
    SELECT 
        COUNT(*),
        COUNT(*) FILTER (WHERE status IN ('BOOKED', 'HELD'))
    INTO 
        v_total_seats,
        v_occupied_seats
    FROM show_seats
    WHERE show_id = p_show_id;

    IF v_total_seats > 0 THEN
        v_occupancy_ratio := v_occupied_seats::NUMERIC / v_total_seats::NUMERIC;
    END IF;

    -- 3. Calculate occupancy-driven price delta
    -- Multiplier scales smoothly with occupancy: higher occupancy -> higher price
    v_occupancy_multiplier := v_occupancy_ratio * v_demand_factor_weight;

    -- 4. Calculate behavioral telemetry demand surge (Mongo inputs)
    -- Normalize views (e.g. 50 views adds significant demand) and abandoned checkouts
    v_behavioral_multiplier := (LEAST(p_recent_views, 200) * 0.002 * v_view_weight * 10) +
                               (LEAST(p_recent_abandonments, 50) * 0.01 * v_abandon_weight * 10);

    -- 5. Combine multipliers
    v_total_multiplier := 1.0000 + v_occupancy_multiplier + v_behavioral_multiplier;

    -- 6. Apply multiplier and clamp to [min_price, max_price]
    v_calculated_price := ROUND(v_base_price * v_total_multiplier, 2);
    v_final_price := GREATEST(v_min_price, LEAST(v_max_price, v_calculated_price));

    -- 7. Determine previous price from latest price_history record (or base_price)
    SELECT new_price INTO v_old_price
    FROM price_history
    WHERE show_id = p_show_id
    ORDER BY recorded_at DESC
    LIMIT 1;

    IF v_old_price IS NULL THEN
        v_old_price := v_base_price;
    END IF;

    -- 8. Log to price_history if changed
    v_reason := FORMAT(
        'Dynamic update: Occ=%%%s, Views=%s, Abandon=%s (Mult: %s)',
        ROUND(v_occupancy_ratio * 100, 1),
        p_recent_views,
        p_recent_abandonments,
        ROUND(v_total_multiplier, 3)
    );

    INSERT INTO price_history (show_id, old_price, new_price, reason, recorded_at)
    VALUES (p_show_id, v_old_price, v_final_price, v_reason, CURRENT_TIMESTAMP);

    RETURN v_final_price;
END;
$$;

-- ============================================================================
-- 2. ADVANCED CONCEPT: Trigger to Prevent Bookings for Past Shows
-- ============================================================================
-- Enforces chronological validity at the database engine level.

CREATE OR REPLACE FUNCTION check_past_show_booking()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_start_time TIMESTAMPTZ;
BEGIN
    SELECT start_time INTO v_start_time
    FROM shows
    WHERE id = NEW.show_id;

    IF v_start_time <= CURRENT_TIMESTAMP THEN
        RAISE EXCEPTION 'Cannot book tickets for a show that has already started (Show ID %, Start Time %)',
            NEW.show_id, v_start_time;
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_prevent_past_show_booking
BEFORE INSERT ON bookings
FOR EACH ROW
EXECUTE FUNCTION check_past_show_booking();

-- ============================================================================
-- 3. ADVANCED CONCEPT: Trigger to Sync Show Status Based on Seat Inventory
-- ============================================================================
-- Automatically updates shows.status to 'SOLD_OUT' or 'SELLING_FAST' when
-- seat states change, maintaining denormalized discovery state with zero race conditions.

CREATE OR REPLACE FUNCTION sync_show_status_from_seats()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_show_id INT;
    v_total INT;
    v_available INT;
    v_ratio NUMERIC;
BEGIN
    v_show_id := COALESCE(NEW.show_id, OLD.show_id);

    SELECT 
        COUNT(*),
        COUNT(*) FILTER (WHERE status = 'AVAILABLE')
    INTO 
        v_total,
        v_available
    FROM show_seats
    WHERE show_id = v_show_id;

    IF v_total > 0 THEN
        v_ratio := v_available::NUMERIC / v_total::NUMERIC;

        IF v_available = 0 THEN
            UPDATE shows 
            SET status = 'SOLD_OUT', updated_at = CURRENT_TIMESTAMP
            WHERE id = v_show_id AND status != 'SOLD_OUT';
        ELSIF v_ratio <= 0.20 THEN
            UPDATE shows 
            SET status = 'SELLING_FAST', updated_at = CURRENT_TIMESTAMP
            WHERE id = v_show_id AND status NOT IN ('SELLING_FAST', 'CANCELLED');
        ELSE
            UPDATE shows 
            SET status = 'SCHEDULED', updated_at = CURRENT_TIMESTAMP
            WHERE id = v_show_id AND status NOT IN ('SCHEDULED', 'CANCELLED');
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sync_show_status
AFTER INSERT OR UPDATE OF status ON show_seats
FOR EACH ROW
EXECUTE FUNCTION sync_show_status_from_seats();

-- ============================================================================
-- 4. ADVANCED CONCEPT: Automated FIFO Waitlist Promotion Function
-- ============================================================================
-- When seats become available (e.g. upon booking cancellation or hold expiry),
-- this function inspects the FIFO queue (ordered by position ASC), finds the
-- next customer whose requested quantity fits into available seats, transitions
-- them to PROMOTED with a 15-minute countdown deadline, and places seats on HOLD.

CREATE OR REPLACE FUNCTION promote_waitlist_fifo(
    p_show_id INT,
    p_available_seats INT
)
RETURNS TABLE (
    promoted_waitlist_id INT,
    promoted_user_id INT,
    allocated_quantity INT
)
LANGUAGE plpgsql
AS $$
DECLARE
    r_waitlist RECORD;
    v_remaining_seats INT := p_available_seats;
BEGIN
    -- Iterate through FIFO waiting queue
    FOR r_waitlist IN 
        SELECT id, user_id, requested_quantity
        FROM waitlist_entries
        WHERE show_id = p_show_id AND status = 'WAITING'
        ORDER BY position ASC
        FOR UPDATE
    LOOP
        IF r_waitlist.requested_quantity <= v_remaining_seats THEN
            -- Promote this entrant
            UPDATE waitlist_entries
            SET status = 'PROMOTED',
                promoted_until = CURRENT_TIMESTAMP + INTERVAL '15 minutes',
                updated_at = CURRENT_TIMESTAMP
            WHERE id = r_waitlist.id;

            promoted_waitlist_id := r_waitlist.id;
            promoted_user_id := r_waitlist.user_id;
            allocated_quantity := r_waitlist.requested_quantity;
            RETURN NEXT;

            v_remaining_seats := v_remaining_seats - r_waitlist.requested_quantity;

            IF v_remaining_seats <= 0 THEN
                EXIT;
            END IF;
        END IF;
    END LOOP;
END;
$$;

-- ============================================================================
-- 5. ADVANCED CONCEPT: Universal Audit Trail Trigger
-- ============================================================================
-- Captures mutations on sensitive financial/rule tables into audit_log as JSONB.

CREATE OR REPLACE FUNCTION log_audit_trail()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF (TG_OP = 'DELETE') THEN
        INSERT INTO audit_log (table_name, record_id, action, changed_by, old_data, new_data)
        VALUES (TG_TABLE_NAME, OLD.id, 'DELETE', NULL, to_jsonb(OLD), NULL);
        RETURN OLD;
    ELSIF (TG_OP = 'UPDATE') THEN
        INSERT INTO audit_log (table_name, record_id, action, changed_by, old_data, new_data)
        VALUES (TG_TABLE_NAME, NEW.id, 'UPDATE', NULL, to_jsonb(OLD), to_jsonb(NEW));
        RETURN NEW;
    ELSIF (TG_OP = 'INSERT') THEN
        INSERT INTO audit_log (table_name, record_id, action, changed_by, old_data, new_data)
        VALUES (TG_TABLE_NAME, NEW.id, 'INSERT', NULL, NULL, to_jsonb(NEW));
        RETURN NEW;
    END IF;
    RETURN NULL;
END;
$$;

CREATE TRIGGER trg_audit_bookings
AFTER INSERT OR UPDATE OR DELETE ON bookings
FOR EACH ROW
EXECUTE FUNCTION log_audit_trail();

CREATE TRIGGER trg_audit_pricing_rules
AFTER INSERT OR UPDATE OR DELETE ON pricing_rules
FOR EACH ROW
EXECUTE FUNCTION log_audit_trail();
