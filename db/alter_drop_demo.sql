-- ============================================================================
-- VenueFlow - DDL Demonstration Script (CREATE, ALTER, DROP)
-- Course Requirement: Demonstrate ALTER TABLE (add column, drop column, add constraint)
-- and DROP TABLE in an isolated demonstration sandbox table without breaking
-- the primary production schema.
-- Target: PostgreSQL 14+
-- ============================================================================

-- Step 1: CREATE demonstration sandbox table
CREATE TABLE sandbox_promotions (
    id SERIAL PRIMARY KEY,
    promo_code VARCHAR(30) NOT NULL UNIQUE,
    promo_title VARCHAR(100) NOT NULL,
    valid_until TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Step 2: ALTER TABLE - Add a new column
ALTER TABLE sandbox_promotions
ADD COLUMN discount_percentage NUMERIC(5, 2) NOT NULL DEFAULT 10.00;

-- Step 3: ALTER TABLE - Add a CHECK constraint to the newly added column
ALTER TABLE sandbox_promotions
ADD CONSTRAINT chk_sandbox_discount_range 
CHECK (discount_percentage >= 0.00 AND discount_percentage <= 100.00);

-- Step 4: ALTER TABLE - Rename a column
ALTER TABLE sandbox_promotions
RENAME COLUMN promo_title TO campaign_name;

-- Step 5: Test inserting a valid record
INSERT INTO sandbox_promotions (promo_code, campaign_name, valid_until, discount_percentage)
VALUES ('EARLYBIRD25', 'Early Bird Stadium Launch', CURRENT_TIMESTAMP + INTERVAL '30 days', 25.00);

-- Step 6: ALTER TABLE - Drop the constraint
ALTER TABLE sandbox_promotions
DROP CONSTRAINT chk_sandbox_discount_range;

-- Step 7: ALTER TABLE - Drop the added column
ALTER TABLE sandbox_promotions
DROP COLUMN discount_percentage;

-- Step 8: DROP TABLE demonstration
DROP TABLE IF EXISTS sandbox_promotions;
