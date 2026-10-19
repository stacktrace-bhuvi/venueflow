# VenueFlow — Entity Relationship (ER) Diagram & Specification

> **Course Requirement:** Complete Entity-Relationship modeling showing all entities, attributes, primary keys, foreign keys, relationships, cardinalities, and constraints for the VenueFlow platform.

---

## 1. Mermaid ER Diagram

```mermaid
erDiagram
    USERS ||--o{ VENUES : "manages (manager_id)"
    USERS ||--o{ EVENTS : "organizes (manager_id)"
    USERS ||--o{ BOOKINGS : "places (user_id)"
    USERS ||--o{ WAITLIST_ENTRIES : "joins (user_id)"
    USERS ||--o{ SHOW_SEATS : "holds (held_by)"
    USERS ||--o{ AUDIT_LOG : "triggers (changed_by)"

    VENUES ||--|{ VENUE_SECTIONS : "contains"
    VENUE_SECTIONS ||--|{ SEATS : "contains"

    EVENTS ||--|{ SHOWS : "schedules"
    VENUES ||--|{ SHOWS : "hosts"

    SHOWS ||--|| PRICING_RULES : "governed by"
    SHOWS ||--|{ SHOW_SEATS : "allocates"
    SEATS ||--|{ SHOW_SEATS : "instantiated in"

    SHOWS ||--o{ BOOKINGS : "booked for"
    SHOWS ||--o{ WAITLIST_ENTRIES : "queues for"
    SHOWS ||--o{ PRICE_HISTORY : "tracks price changes"

    BOOKINGS ||--|{ BOOKING_ITEMS : "contains"
    SHOW_SEATS ||--o| BOOKING_ITEMS : "reserved as"

    BOOKINGS ||--o| PAYMENTS : "paid via"

    USERS {
        int id PK
        string email UK "NOT NULL"
        string password_hash "NOT NULL"
        string full_name "NOT NULL"
        string phone
        user_role role "NOT NULL (customer | manager | admin)"
        timestamptz created_at "NOT NULL"
        timestamptz updated_at "NOT NULL"
    }

    VENUES {
        int id PK
        int manager_id FK "NOT NULL -> users(id)"
        string name "NOT NULL"
        string address "NOT NULL"
        string city "NOT NULL"
        string state "NOT NULL"
        string postal_code "NOT NULL"
        int total_capacity "NOT NULL, CHECK > 0"
        timestamptz created_at "NOT NULL"
        timestamptz updated_at "NOT NULL"
    }

    VENUE_SECTIONS {
        int id PK
        int venue_id FK "NOT NULL -> venues(id)"
        seat_section name "NOT NULL (VIP | PREMIUM | GENERAL | BALCONY)"
        numeric base_multiplier "NOT NULL, DEFAULT 1.0, CHECK >= 1.0"
        int capacity "NOT NULL, CHECK > 0"
        timestamptz created_at "NOT NULL"
    }

    SEATS {
        int id PK
        int venue_section_id FK "NOT NULL -> venue_sections(id)"
        string row_label "NOT NULL"
        int seat_number "NOT NULL, CHECK > 0"
        boolean is_accessible "NOT NULL, DEFAULT false"
        timestamptz created_at "NOT NULL"
    }

    EVENTS {
        int id PK
        int manager_id FK "NOT NULL -> users(id)"
        string title "NOT NULL"
        text description "NOT NULL"
        string artist "NOT NULL"
        string genre "NOT NULL"
        int duration_minutes "NOT NULL, CHECK > 0"
        string poster_url
        boolean is_active "NOT NULL, DEFAULT true"
        tsvector search_vector "GENERATED ALWAYS"
        timestamptz created_at "NOT NULL"
        timestamptz updated_at "NOT NULL"
    }

    SHOWS {
        int id PK
        int event_id FK "NOT NULL -> events(id)"
        int venue_id FK "NOT NULL -> venues(id)"
        timestamptz start_time "NOT NULL"
        timestamptz end_time "NOT NULL, CHECK end_time > start_time"
        numeric base_price "NOT NULL, CHECK base_price > 0"
        show_status status "NOT NULL (SCHEDULED | SELLING_FAST | SOLD_OUT | COMPLETED | CANCELLED)"
        timestamptz created_at "NOT NULL"
        timestamptz updated_at "NOT NULL"
    }

    PRICING_RULES {
        int id PK
        int show_id FK "NOT NULL, UNIQUE -> shows(id)"
        numeric min_price "NOT NULL, CHECK > 0"
        numeric max_price "NOT NULL, CHECK max_price >= min_price"
        numeric demand_factor_weight "NOT NULL, DEFAULT 0.35, CHECK >= 0"
        numeric view_weight "NOT NULL, DEFAULT 0.05, CHECK >= 0"
        numeric search_weight "NOT NULL, DEFAULT 0.10, CHECK >= 0"
        numeric abandon_weight "NOT NULL, DEFAULT 0.08, CHECK >= 0"
        timestamptz created_at "NOT NULL"
        timestamptz updated_at "NOT NULL"
    }

    SHOW_SEATS {
        int id PK
        int show_id FK "NOT NULL -> shows(id)"
        int seat_id FK "NOT NULL -> seats(id)"
        seat_status status "NOT NULL (AVAILABLE | HELD | BOOKED)"
        int held_by FK "NULLABLE -> users(id)"
        timestamptz hold_expires_at "NULLABLE"
        int version "NOT NULL, DEFAULT 1"
        timestamptz updated_at "NOT NULL"
    }

    BOOKINGS {
        int id PK
        int user_id FK "NOT NULL -> users(id)"
        int show_id FK "NOT NULL -> shows(id)"
        string booking_reference UK "NOT NULL"
        numeric total_amount "NOT NULL, CHECK >= 0"
        booking_status status "NOT NULL (CONFIRMED | CANCELLED | REFUNDED)"
        timestamptz created_at "NOT NULL"
        timestamptz updated_at "NOT NULL"
    }

    BOOKING_ITEMS {
        int id PK
        int booking_id FK "NOT NULL -> bookings(id)"
        int show_seat_id FK "NOT NULL, UNIQUE -> show_seats(id)"
        numeric price_paid "NOT NULL, CHECK >= 0"
        timestamptz created_at "NOT NULL"
    }

    PAYMENTS {
        int id PK
        int booking_id FK "NOT NULL, UNIQUE -> bookings(id)"
        string transaction_reference UK "NOT NULL"
        numeric amount "NOT NULL, CHECK >= 0"
        payment_method payment_method "NOT NULL"
        payment_status payment_status "NOT NULL"
        jsonb provider_response "NULLABLE"
        timestamptz created_at "NOT NULL"
    }

    WAITLIST_ENTRIES {
        int id PK
        int show_id FK "NOT NULL -> shows(id)"
        int user_id FK "NOT NULL -> users(id)"
        int requested_quantity "NOT NULL, CHECK BETWEEN 1 AND 10"
        int position "NOT NULL, CHECK > 0"
        waitlist_status status "NOT NULL (WAITING | PROMOTED | EXPIRED | FULFILLED | CANCELLED)"
        timestamptz promoted_until "NULLABLE"
        timestamptz created_at "NOT NULL"
        timestamptz updated_at "NOT NULL"
    }

    PRICE_HISTORY {
        int id PK
        int show_id FK "NOT NULL -> shows(id)"
        numeric old_price "NOT NULL"
        numeric new_price "NOT NULL"
        string reason "NOT NULL"
        timestamptz recorded_at "NOT NULL"
    }

    AUDIT_LOG {
        int id PK
        string table_name "NOT NULL"
        int record_id "NOT NULL"
        string action "NOT NULL (INSERT | UPDATE | DELETE)"
        int changed_by "NULLABLE"
        jsonb old_data "NULLABLE"
        jsonb new_data "NULLABLE"
        timestamptz created_at "NOT NULL"
    }
```

---

## 2. Cardinalities & Relationship Rationale

1. **USERS to VENUES (`1 : N`)**:
   - A manager manages zero, one, or multiple venues.
   - Each venue has exactly one designated manager (`manager_id`).
2. **VENUES to VENUE_SECTIONS (`1 : N`)**:
   - A venue is partitioned into multiple seating sections (`VIP`, `PREMIUM`, `GENERAL`, `BALCONY`).
   - A section belongs to exactly one venue.
3. **VENUE_SECTIONS to SEATS (`1 : N`)**:
   - A section comprises multiple individual seats identified by `(row_label, seat_number)`.
   - `UNIQUE(venue_section_id, row_label, seat_number)` guarantees no duplicate physical seat labels.
4. **EVENTS to SHOWS (`1 : N`) & VENUES to SHOWS (`1 : N`)**:
   - An event can be scheduled across multiple show times and venues.
   - Each show is a specific event at a specific venue at a designated start and end time.
5. **SHOWS to SHOW_SEATS (`1 : N`) & SEATS to SHOW_SEATS (`1 : N`)**:
   - For every show, each physical seat in the hosting venue is instantiated into `SHOW_SEATS`.
   - `UNIQUE(show_id, seat_id)` prevents assigning the same seat to the same show more than once.
   - Contains hold state (`held_by`, `hold_expires_at`) and optimistic locking `version`.
6. **SHOWS to PRICING_RULES (`1 : 1`)**:
   - Every show has exactly one active dynamic pricing policy specifying bounds (`min_price`, `max_price`) and demand coefficients.
7. **BOOKINGS to BOOKING_ITEMS (`1 : N`) & SHOW_SEATS to BOOKING_ITEMS (`1 : 1`)**:
   - A booking can encompass multiple seats (items).
   - Each `show_seat_id` can be referenced by at most one confirmed `booking_items` record (`UNIQUE`).
8. **BOOKINGS to PAYMENTS (`1 : 1`)**:
   - Every booking has a simulated payment ledger record capturing transaction reference, method, and status.
9. **SHOWS to WAITLIST_ENTRIES (`1 : N`) & USERS to WAITLIST_ENTRIES (`1 : N`)**:
   - When a show is sold out, users queue in FIFO order with an explicit integer `position`.
10. **SHOWS to PRICE_HISTORY (`1 : N`)**:
    - Audit log for each dynamic pricing recalculation, capturing price changes and trigger reasons.
