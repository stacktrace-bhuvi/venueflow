# VenueFlow — Relational Schema & 3NF Normalization Analysis

> **Course Requirement:** Detailed relational schema mapping, attribute types, keys, functional dependency (FD) analysis, and third normal form (3NF) normalization proof.

---

## 1. Relational Schema Representation

Underline indicates **Primary Key (PK)**; asterisk (*) indicates **Foreign Key (FK)**.

- **USERS**(\underline{id}, email, password_hash, full_name, phone, role, created_at, updated_at)
- **VENUES**(\underline{id}, *manager_id*, name, address, city, state, postal_code, total_capacity, created_at, updated_at)
- **VENUE_SECTIONS**(\underline{id}, *venue_id*, name, base_multiplier, capacity, created_at)
- **SEATS**(\underline{id}, *venue_section_id*, row_label, seat_number, is_accessible, created_at)
- **EVENTS**(\underline{id}, *manager_id*, title, description, artist, genre, duration_minutes, poster_url, is_active, search_vector, created_at, updated_at)
- **SHOWS**(\underline{id}, *event_id*, *venue_id*, start_time, end_time, base_price, status, created_at, updated_at)
- **PRICING_RULES**(\underline{id}, *show_id*, min_price, max_price, demand_factor_weight, view_weight, search_weight, abandon_weight, created_at, updated_at)
- **SHOW_SEATS**(\underline{id}, *show_id*, *seat_id*, status, *held_by*, hold_expires_at, version, updated_at)
- **BOOKINGS**(\underline{id}, *user_id*, *show_id*, booking_reference, total_amount, status, created_at, updated_at)
- **BOOKING_ITEMS**(\underline{id}, *booking_id*, *show_seat_id*, price_paid, created_at)
- **PAYMENTS**(\underline{id}, *booking_id*, transaction_reference, amount, payment_method, payment_status, provider_response, created_at)
- **WAITLIST_ENTRIES**(\underline{id}, *show_id*, *user_id*, requested_quantity, position, status, promoted_until, created_at, updated_at)
- **PRICE_HISTORY**(\underline{id}, *show_id*, old_price, new_price, reason, recorded_at)
- **AUDIT_LOG**(\underline{id}, table_name, record_id, action, *changed_by*, old_data, new_data, created_at)

---

## 2. Functional Dependencies (FDs) per Relation

### 2.1 USERS
- `id -> email, password_hash, full_name, phone, role, created_at, updated_at`
- `email -> id, password_hash, full_name, phone, role, created_at, updated_at` (Candidate Key)

### 2.2 VENUES
- `id -> manager_id, name, address, city, state, postal_code, total_capacity, created_at, updated_at`

### 2.3 VENUE_SECTIONS
- `id -> venue_id, name, base_multiplier, capacity, created_at`
- `(venue_id, name) -> id, base_multiplier, capacity, created_at` (Candidate Key)

### 2.4 SEATS
- `id -> venue_section_id, row_label, seat_number, is_accessible, created_at`
- `(venue_section_id, row_label, seat_number) -> id, is_accessible, created_at` (Candidate Key)

### 2.5 EVENTS
- `id -> manager_id, title, description, artist, genre, duration_minutes, poster_url, is_active, search_vector, created_at, updated_at`

### 2.6 SHOWS
- `id -> event_id, venue_id, start_time, end_time, base_price, status, created_at, updated_at`

### 2.7 PRICING_RULES
- `id -> show_id, min_price, max_price, demand_factor_weight, view_weight, search_weight, abandon_weight, created_at, updated_at`
- `show_id -> id, min_price, max_price, demand_factor_weight, view_weight, search_weight, abandon_weight, created_at, updated_at` (Candidate Key: 1:1 with SHOWS)

### 2.8 SHOW_SEATS
- `id -> show_id, seat_id, status, held_by, hold_expires_at, version, updated_at`
- `(show_id, seat_id) -> id, status, held_by, hold_expires_at, version, updated_at` (Candidate Key)

### 2.9 BOOKINGS
- `id -> user_id, show_id, booking_reference, total_amount, status, created_at, updated_at`
- `booking_reference -> id, user_id, show_id, total_amount, status, created_at, updated_at` (Candidate Key)

### 2.10 BOOKING_ITEMS
- `id -> booking_id, show_seat_id, price_paid, created_at`
- `show_seat_id -> id, booking_id, price_paid, created_at` (Candidate Key: seat reserved in at most one booking)

### 2.11 PAYMENTS
- `id -> booking_id, transaction_reference, amount, payment_method, payment_status, provider_response, created_at`
- `transaction_reference -> id, booking_id, amount, payment_method, payment_status, provider_response, created_at` (Candidate Key)
- `booking_id -> id, transaction_reference, amount, payment_method, payment_status, provider_response, created_at` (Candidate Key)

### 2.12 WAITLIST_ENTRIES
- `id -> show_id, user_id, requested_quantity, position, status, promoted_until, created_at, updated_at`

---

## 3. Normalization Proof (1NF -> 2NF -> 3NF)

### 3.1 First Normal Form (1NF)
A relation is in 1NF if and only if all underlying domains contain atomic (indivisible) values, and there are no repeating groups or multi-valued attributes.
- **Verification:** All attributes in the VenueFlow schema (`VARCHAR`, `INT`, `NUMERIC`, `TIMESTAMPTZ`, `BOOLEAN`) contain single atomic values.
- Array data types are deliberately avoided for transactional entities (e.g., booked seats are decomposed into normalized `BOOKING_ITEMS` tuples rather than an array of seat IDs in `BOOKINGS`).
- Hence, all tables satisfy **1NF**.

### 3.2 Second Normal Form (2NF)
A relation is in 2NF if it is in 1NF and every non-prime attribute is fully functionally dependent on any candidate key (no partial functional dependencies).
- **Verification:**
  - In tables with single-column primary keys (`USERS`, `VENUES`, `EVENTS`, `SHOWS`, `PRICING_RULES`, `BOOKINGS`, `BOOKING_ITEMS`, `PAYMENTS`, `WAITLIST_ENTRIES`), partial key dependency is mathematically impossible because no proper subset of the primary key exists.
  - In tables with composite candidate keys:
    - In `VENUE_SECTIONS`: Candidate key is `(venue_id, name)`. Neither `venue_id` alone nor `name` alone determines `capacity` or `base_multiplier` (the multiplier depends strictly on that specific section of that specific venue). Thus, full functional dependency holds.
    - In `SEATS`: Candidate key is `(venue_section_id, row_label, seat_number)`. `is_accessible` depends entirely on the specific seat in that section, not on row or section alone.
    - In `SHOW_SEATS`: Candidate key is `(show_id, seat_id)`. Seat status, hold expiration, and holder depend simultaneously on the show instance and the physical seat.
- Hence, all tables satisfy **2NF**.

### 3.3 Third Normal Form (3NF)
A relation is in 3NF if it is in 2NF and for every non-trivial functional dependency $X \rightarrow Y$:
1. $X$ is a superkey, OR
2. $Y$ is a prime attribute (part of a candidate key).
This guarantees no transitive dependencies ($X \rightarrow Z \rightarrow Y$ where neither $Z$ nor $Y$ is a candidate key).

- **Verification:**
  - In `BOOKINGS`: `user_id` does not determine `total_amount` or `show_id`. `booking_reference` is a candidate key ($X$ is a superkey). There are no transitive relationships between non-key attributes.
  - In `SHOWS`: `venue_id` and `event_id` are foreign keys; neither determines the other or any non-prime attribute (e.g. `base_price` is show-specific).
  - In `BOOKING_ITEMS`: `price_paid` represents the historical price captured at the exact moment of transaction, preventing reliance on dynamic `SHOWS.base_price` (which fluctuates dynamically). This avoids transitive dependency and preserves immutable financial audit integrity.
  - In `VENUES`: `city`, `state`, `postal_code` describe the venue location. No non-key attribute transitively determines venue details.
- Hence, all relations satisfy **3NF**.

---

## 4. Referential Integrity Policies

| Foreign Key | Parent Table | Child Table | ON DELETE Action | Justification |
| :--- | :--- | :--- | :--- | :--- |
| `manager_id` | `USERS` | `VENUES` | `RESTRICT` | Cannot delete a manager account while active venues are assigned. |
| `venue_id` | `VENUES` | `VENUE_SECTIONS` | `CASCADE` | Removing a venue automatically removes its seating sections. |
| `venue_section_id` | `VENUE_SECTIONS` | `SEATS` | `CASCADE` | Removing a section removes its physical seat definitions. |
| `manager_id` | `USERS` | `EVENTS` | `RESTRICT` | Prevents orphaned events if manager record is manipulated. |
| `event_id` | `EVENTS` | `SHOWS` | `CASCADE` | Removing an event cancels/removes its scheduled show instances. |
| `venue_id` | `VENUES` | `SHOWS` | `RESTRICT` | Cannot delete a venue that has upcoming scheduled shows. |
| `show_id` | `SHOWS` | `SHOW_SEATS` | `CASCADE` | Removing a show clears show seat instantiations. |
| `held_by` | `USERS` | `SHOW_SEATS` | `SET NULL` | If a temporary holding user is deleted, hold is released back to available. |
| `booking_id` | `BOOKINGS` | `BOOKING_ITEMS` | `CASCADE` | Booking items are component parts of a booking header. |
| `show_seat_id` | `SHOW_SEATS` | `BOOKING_ITEMS` | `RESTRICT` | Cannot delete a show seat record if a finalized booking references it. |
| `booking_id` | `BOOKINGS` | `PAYMENTS` | `CASCADE` | Payments belong to the lifecycle of the booking. |
