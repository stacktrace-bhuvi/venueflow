# VenueFlow — Data Dictionary

> **DBMS Level 3 Capstone Project**  
> Complete technical reference for all PostgreSQL relational tables, domains, constraints, and audit entities.

---

## 1. Table: `users`
Stores user identities, credentials, and access control roles.

| Column | Data Type | Nullable | Key / Constraint | Default | Description |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `id` | `SERIAL` | No | **PK** | auto | Unique surrogate user identifier. |
| `email` | `VARCHAR(255)` | No | **UNIQUE**, `chk_users_email_format` | - | Validated email address used for login. |
| `password_hash` | `VARCHAR(255)` | No | - | - | Salted bcrypt hash of password (10 rounds). Plaintext strictly forbidden. |
| `full_name` | `VARCHAR(120)` | No | - | - | User's legal name. |
| `phone` | `VARCHAR(30)` | Yes | - | - | User contact phone number. |
| `role` | `user_role` | No | ENUM (`customer`, `manager`, `admin`) | `'customer'` | Role-based authorization tier. |
| `created_at` | `TIMESTAMPTZ` | No | - | `NOW()` | Timestamp account was created. |
| `updated_at` | `TIMESTAMPTZ` | No | - | `NOW()` | Timestamp account was last modified. |

---

## 2. Table: `venues`
Physical or outdoor entertainment locations hosting shows.

| Column | Data Type | Nullable | Key / Constraint | Default | Description |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `id` | `SERIAL` | No | **PK** | auto | Unique venue identifier. |
| `manager_id` | `INT` | No | **FK** -> `users(id)` `ON DELETE RESTRICT` | - | Designated venue operations manager. |
| `name` | `VARCHAR(150)` | No | - | - | Name of the venue or stadium. |
| `address` | `VARCHAR(255)` | No | - | - | Street address. |
| `city` | `VARCHAR(80)` | No | - | - | City location (indexed for regional discovery). |
| `state` | `VARCHAR(80)` | No | - | - | State/province. |
| `postal_code` | `VARCHAR(20)` | No | - | - | Postal PIN / ZIP code. |
| `total_capacity`| `INT` | No | `CHECK (total_capacity > 0)` | - | Aggregate seating capacity. |
| `created_at` | `TIMESTAMPTZ` | No | - | `NOW()` | Timestamp of record creation. |
| `updated_at` | `TIMESTAMPTZ` | No | - | `NOW()` | Timestamp of record update. |

---

## 3. Table: `venue_sections`
Seating tiers within a venue with distinct price multipliers.

| Column | Data Type | Nullable | Key / Constraint | Default | Description |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `id` | `SERIAL` | No | **PK** | auto | Unique section identifier. |
| `venue_id` | `INT` | No | **FK** -> `venues(id)` `ON DELETE CASCADE` | - | Venue this section belongs to. |
| `name` | `seat_section` | No | ENUM (`VIP`, `PREMIUM`, `GENERAL`, `BALCONY`) | - | Section categorization name. |
| `base_multiplier`| `NUMERIC(4,2)`| No | `CHECK (base_multiplier >= 1.00)` | `1.00` | Section multiplier applied to show base price. |
| `capacity` | `INT` | No | `CHECK (capacity > 0)` | - | Maximum seats in this section. |
| `created_at` | `TIMESTAMPTZ` | No | - | `NOW()` | Timestamp of creation. |
| - | - | - | **UNIQUE** (`venue_id`, `name`) | - | A venue cannot have duplicate named sections. |

---

## 4. Table: `seats`
Individual physical chairs / seating coordinates within a section.

| Column | Data Type | Nullable | Key / Constraint | Default | Description |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `id` | `SERIAL` | No | **PK** | auto | Unique physical seat identifier. |
| `venue_section_id`| `INT` | No | **FK** -> `venue_sections(id)` `ON DELETE CASCADE` | - | Enclosing section. |
| `row_label` | `VARCHAR(10)` | No | - | - | Row identifier (e.g., 'A', 'B', 'C'). |
| `seat_number` | `INT` | No | `CHECK (seat_number > 0)` | - | Number along the row (1, 2, ...). |
| `is_accessible`| `BOOLEAN` | No | - | `FALSE` | Indicates ADA / wheelchair accessibility. |
| `created_at` | `TIMESTAMPTZ` | No | - | `NOW()` | Timestamp of creation. |
| - | - | - | **UNIQUE** (`venue_section_id`, `row_label`, `seat_number`) | - | Guarantees physical seat label uniqueness. |

---

## 5. Table: `events`
Performances, concerts, or matches cataloged on the platform.

| Column | Data Type | Nullable | Key / Constraint | Default | Description |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `id` | `SERIAL` | No | **PK** | auto | Unique event identifier. |
| `manager_id` | `INT` | No | **FK** -> `users(id)` `ON DELETE RESTRICT` | - | Event organizer/manager. |
| `title` | `VARCHAR(200)`| No | - | - | Event title. |
| `description` | `TEXT` | No | - | - | Detailed event description. |
| `artist` | `VARCHAR(150)`| No | - | - | Performer, band, or troupe. |
| `genre` | `VARCHAR(60)` | No | - | - | Genre classification (e.g. Rock, Theater). |
| `duration_minutes`| `INT` | No | `CHECK (duration_minutes > 0)` | - | Expected running time in minutes. |
| `poster_url` | `TEXT` | Yes | - | - | URL to event promotional banner. |
| `is_active` | `BOOLEAN` | No | - | `TRUE` | Soft-deletion and publication flag. |
| `search_vector`| `tsvector` | No | Generated `STORED`, **GIN Indexed** | auto | Weighted tsvector across title, artist, genre, description. |
| `created_at` | `TIMESTAMPTZ` | No | - | `NOW()` | Timestamp of creation. |
| `updated_at` | `TIMESTAMPTZ` | No | - | `NOW()` | Timestamp of last modification. |

---

## 6. Table: `shows`
A scheduled exhibition of an event at a venue for a specified time window.

| Column | Data Type | Nullable | Key / Constraint | Default | Description |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `id` | `SERIAL` | No | **PK** | auto | Unique show instance identifier. |
| `event_id` | `INT` | No | **FK** -> `events(id)` `ON DELETE CASCADE` | - | Associated event. |
| `venue_id` | `INT` | No | **FK** -> `venues(id)` `ON DELETE RESTRICT` | - | Hosting venue location. |
| `start_time` | `TIMESTAMPTZ` | No | - | - | Performance commencement timestamp. |
| `end_time` | `TIMESTAMPTZ` | No | `chk_show_time_range: end_time > start_time` | - | Performance conclusion timestamp. |
| `base_price` | `NUMERIC(10,2)`| No | `CHECK (base_price > 0)` | - | Baseline general ticket price. |
| `status` | `show_status` | No | ENUM (`SCHEDULED`, `SELLING_FAST`, `SOLD_OUT`, `COMPLETED`, `CANCELLED`) | `'SCHEDULED'` | Lifecycle state. |
| `created_at` | `TIMESTAMPTZ` | No | - | `NOW()` | Timestamp of scheduling. |
| `updated_at` | `TIMESTAMPTZ` | No | - | `NOW()` | Timestamp of modification. |

---

## 7. Table: `pricing_rules`
Dynamic pricing parameters governing price elasticity for a show.

| Column | Data Type | Nullable | Key / Constraint | Default | Description |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `id` | `SERIAL` | No | **PK** | auto | Unique pricing rule identifier. |
| `show_id` | `INT` | No | **FK, UNIQUE** -> `shows(id)` `ON DELETE CASCADE` | - | 1:1 binding to show. |
| `min_price` | `NUMERIC(10,2)`| No | `CHECK (min_price > 0)` | - | Hard floor dynamic price cannot drop below. |
| `max_price` | `NUMERIC(10,2)`| No | `CHECK (max_price >= min_price)` | - | Hard ceiling dynamic price cannot exceed. |
| `demand_factor_weight`| `NUMERIC(4,2)`| No | `CHECK (demand_factor_weight >= 0)` | `0.35` | Multiplier weight for seat occupancy. |
| `view_weight` | `NUMERIC(4,2)`| No | `CHECK (view_weight >= 0)` | `0.05` | Weight applied to recent Mongo page views. |
| `search_weight`| `NUMERIC(4,2)`| No | `CHECK (search_weight >= 0)` | `0.10` | Weight applied to recent search velocity. |
| `abandon_weight`| `NUMERIC(4,2)`| No | `CHECK (abandon_weight >= 0)` | `0.08` | Weight applied to abandoned checkout signals. |
| `created_at` | `TIMESTAMPTZ` | No | - | `NOW()` | Timestamp of creation. |
| `updated_at` | `TIMESTAMPTZ` | No | - | `NOW()` | Timestamp of rule update. |

---

## 8. Table: `show_seats`
State of an individual seat for a specific show (Pessimistic Locking target).

| Column | Data Type | Nullable | Key / Constraint | Default | Description |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `id` | `SERIAL` | No | **PK** | auto | Unique show-seat instance identifier. |
| `show_id` | `INT` | No | **FK** -> `shows(id)` `ON DELETE CASCADE` | - | Target show. |
| `seat_id` | `INT` | No | **FK** -> `seats(id)` `ON DELETE CASCADE` | - | Physical seat coordinate. |
| `status` | `seat_status` | No | ENUM (`AVAILABLE`, `HELD`, `BOOKED`) | `'AVAILABLE'`| Current reservation status. |
| `held_by` | `INT` | Yes | **FK** -> `users(id)` `ON DELETE SET NULL` | NULL | Customer currently holding this seat. |
| `hold_expires_at`| `TIMESTAMPTZ`| Yes | Indexed where `status = 'HELD'` | NULL | Expiration timestamp for temporary hold. |
| `version` | `INT` | No | - | `1` | Optimistic concurrency version counter. |
| `updated_at` | `TIMESTAMPTZ` | No | - | `NOW()` | Timestamp of status transition. |
| - | - | - | **UNIQUE** (`show_id`, `seat_id`) | - | Seat cannot be instantiated twice per show. |
| - | - | - | **PARTIAL UNIQUE INDEX** (`show_id`, `seat_id`) WHERE `status = 'BOOKED'` | - | Guarantees physical impossibility of double booking. |
| - | - | - | `chk_hold_integrity` | - | Requires `held_by` and `hold_expires_at` when HELD. |

---

## 9. Table: `bookings`
Header record for a customer transaction.

| Column | Data Type | Nullable | Key / Constraint | Default | Description |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `id` | `SERIAL` | No | **PK** | auto | Unique booking transaction identifier. |
| `user_id` | `INT` | No | **FK** -> `users(id)` `ON DELETE RESTRICT` | - | Customer making the booking. |
| `show_id` | `INT` | No | **FK** -> `shows(id)` `ON DELETE RESTRICT` | - | Show being attended. |
| `booking_reference`| `VARCHAR(32)`| No | **UNIQUE** | - | Human-readable alphanumeric booking code (e.g. BK-20261019-98A1). |
| `total_amount`| `NUMERIC(10,2)`| No | `CHECK (total_amount >= 0)` | - | Total final cost paid across all items. |
| `status` | `booking_status`| No | ENUM (`CONFIRMED`, `CANCELLED`, `REFUNDED`)| `'CONFIRMED'`| Booking lifecycle status. |
| `created_at` | `TIMESTAMPTZ` | No | - | `NOW()` | Timestamp when booking completed. |
| `updated_at` | `TIMESTAMPTZ` | No | - | `NOW()` | Timestamp of modification (e.g. cancellation). |

---

## 10. Table: `booking_items`
Line items detailing individual seats reserved in a booking and the exact price paid.

| Column | Data Type | Nullable | Key / Constraint | Default | Description |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `id` | `SERIAL` | No | **PK** | auto | Line item identifier. |
| `booking_id` | `INT` | No | **FK** -> `bookings(id)` `ON DELETE CASCADE` | - | Parent booking. |
| `show_seat_id`| `INT` | No | **FK, UNIQUE** -> `show_seats(id)` `ON DELETE RESTRICT` | - | Show seat locked to this booking item. |
| `price_paid` | `NUMERIC(10,2)`| No | `CHECK (price_paid >= 0)` | - | Snapshot of price charged at checkout. |
| `created_at` | `TIMESTAMPTZ` | No | - | `NOW()` | Line item creation timestamp. |

---

## 11. Table: `payments`
Financial transaction record verifying receipt of funds.

| Column | Data Type | Nullable | Key / Constraint | Default | Description |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `id` | `SERIAL` | No | **PK** | auto | Unique payment identifier. |
| `booking_id` | `INT` | No | **FK, UNIQUE** -> `bookings(id)` `ON DELETE CASCADE` | - | 1:1 link to booking. |
| `transaction_reference`| `VARCHAR(64)`| No | **UNIQUE** | - | Gateway / simulated transaction ID. |
| `amount` | `NUMERIC(10,2)`| No | `CHECK (amount >= 0)` | - | Currency amount processed. |
| `payment_method`| `payment_method`| No | ENUM (`CREDIT_CARD`, `DEBIT_CARD`, `UPI`, `NET_BANKING`) | `'CREDIT_CARD'`| Payment rails. |
| `payment_status`| `payment_status`| No | ENUM (`SUCCESS`, `FAILED`, `REFUNDED`) | `'SUCCESS'` | Payment settlement status. |
| `provider_response`| `JSONB` | Yes | - | NULL | Simulated payment gateway metadata payload. |
| `created_at` | `TIMESTAMPTZ` | No | - | `NOW()` | Timestamp of payment confirmation. |

---

## 12. Table: `waitlist_entries`
First-In-First-Out priority queue entries for sold-out shows.

| Column | Data Type | Nullable | Key / Constraint | Default | Description |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `id` | `SERIAL` | No | **PK** | auto | Unique waitlist record identifier. |
| `show_id` | `INT` | No | **FK** -> `shows(id)` `ON DELETE CASCADE` | - | Target sold-out show. |
| `user_id` | `INT` | No | **FK** -> `users(id)` `ON DELETE CASCADE` | - | Customer in waitlist queue. |
| `requested_quantity`| `INT` | No | `CHECK (requested_quantity BETWEEN 1 AND 10)` | - | Number of adjacent seats requested. |
| `position` | `INT` | No | `CHECK (position > 0)` | - | Current 1-based queue priority index. |
| `status` | `waitlist_status`| No | ENUM (`WAITING`, `PROMOTED`, `EXPIRED`, `FULFILLED`, `CANCELLED`)| `'WAITING'`| State of waitlist ticket request. |
| `promoted_until`| `TIMESTAMPTZ`| Yes | Indexed where `status = 'PROMOTED'` | NULL | Promotion countdown deadline before cascading. |
| `created_at` | `TIMESTAMPTZ` | No | - | `NOW()` | Timestamp user joined waitlist. |
| `updated_at` | `TIMESTAMPTZ` | No | - | `NOW()` | Timestamp of promotion or status update. |

---

## 13. Table: `price_history`
Audit log recording every dynamic price recalculation.

| Column | Data Type | Nullable | Key / Constraint | Default | Description |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `id` | `SERIAL` | No | **PK** | auto | Unique price log identifier. |
| `show_id` | `INT` | No | **FK** -> `shows(id)` `ON DELETE CASCADE` | - | Show whose price adjusted. |
| `old_price` | `NUMERIC(10,2)`| No | - | - | Price prior to adjustment. |
| `new_price` | `NUMERIC(10,2)`| No | - | - | Price computed by dynamic pricing function. |
| `reason` | `VARCHAR(150)`| No | - | - | Explanatory reason (occupancy, Mongo telemetry surge). |
| `recorded_at` | `TIMESTAMPTZ` | No | - | `NOW()` | Timestamp of price change. |

---

## 14. Table: `audit_log`
System-wide audit trail capturing record mutations triggered by DB triggers.

| Column | Data Type | Nullable | Key / Constraint | Default | Description |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `id` | `SERIAL` | No | **PK** | auto | Unique audit log entry identifier. |
| `table_name` | `VARCHAR(50)` | No | - | - | Target mutated table name. |
| `record_id` | `INT` | No | - | - | Primary key ID of the affected row. |
| `action` | `VARCHAR(20)` | No | `CHECK (action IN ('INSERT', 'UPDATE', 'DELETE'))` | - | Triggered DML operation. |
| `changed_by` | `INT` | Yes | - | NULL | User ID who initiated mutation. |
| `old_data` | `JSONB` | Yes | - | NULL | JSON snapshot of row state prior to update/delete. |
| `new_data` | `JSONB` | Yes | - | NULL | JSON snapshot of row state after insert/update. |
| `created_at` | `TIMESTAMPTZ` | No | - | `NOW()` | Timestamp when audit trigger fired. |
