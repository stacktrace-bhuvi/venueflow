# VenueFlow — API Contract & Specification

> **Version:** 1.0.0-draft  
> **Target Audience:** Frontend Team (Person 2), Backend/Database Lead (Person 1), Project Evaluators  
> **Base Path:** `/api`  
> **Content-Type:** `application/json`

---

## 1. Global Conventions

### 1.1 Authentication & Sessions
- Authentication uses **JWT** stored in an `httpOnly`, `SameSite=Lax`, `Secure` (in production) cookie named `venueflow_token`.
- The API also optionally accepts `Authorization: Bearer <token>` in headers for programmatic clients and automated test suites.
- User Roles:
  - `customer`: Browse events, select seats, hold seats, complete bookings, cancel own bookings, join waitlists.
  - `manager`: Create/edit own events & shows, configure dynamic pricing rules for own shows, view venue-level occupancy & revenue analytics.
  - `admin`: Platform-wide oversight: manage users, suspend accounts, audit logs, system-wide analytics, cross-venue administration.

### 1.2 Standard Response Envelopes

#### Success Envelope (`200 OK`, `201 Created`):
```json
{
  "success": true,
  "data": { ... },
  "message": "Optional human-readable confirmation"
}
```

#### Error Envelope (`400 Bad Request`, `401 Unauthorized`, `403 Forbidden`, `404 Not Found`, `409 Conflict`, `422 Unprocessable`, `500 Internal Server Error`):
```json
{
  "success": false,
  "error": {
    "code": "SEAT_ALREADY_RESERVED",
    "message": "One or more selected seats were locked by another user.",
    "details": [
      { "field": "seatIds", "issue": "Seat 104 is currently HELD" }
    ]
  }
}
```

---

## 2. Authentication Endpoints (`/api/auth`)

### 2.1 Register
- **Endpoint:** `POST /api/auth/register`
- **Auth:** Public
- **Request Body:**
```json
{
  "name": "Jane Doe",
  "email": "jane@example.com",
  "password": "Password123!",
  "role": "customer" // "customer" | "manager" (admin requires invite/seed)
}
```
- **Response (`201 Created`):**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": 1,
      "name": "Jane Doe",
      "email": "jane@example.com",
      "role": "customer",
      "createdAt": "2026-10-19T10:00:00.000Z"
    }
  },
  "message": "Registration successful"
}
```

### 2.2 Login
- **Endpoint:** `POST /api/auth/login`
- **Auth:** Public
- **Request Body:**
```json
{
  "email": "jane@example.com",
  "password": "Password123!"
}
```
- **Response (`200 OK`):** Sets `Set-Cookie: venueflow_token=...; HttpOnly; Path=/;`
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOi...",
    "user": {
      "id": 1,
      "name": "Jane Doe",
      "email": "jane@example.com",
      "role": "customer"
    }
  },
  "message": "Login successful"
}
```

### 2.3 Logout
- **Endpoint:** `POST /api/auth/logout`
- **Auth:** Authenticated (`customer`, `manager`, `admin`)
- **Response (`200 OK`):** Clears cookie.
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

### 2.4 Get Current Session User
- **Endpoint:** `GET /api/auth/me`
- **Auth:** Authenticated
- **Response (`200 OK`):**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "name": "Jane Doe",
    "email": "jane@example.com",
    "role": "customer"
  }
}
```

---

## 3. Public Discovery Endpoints (`/api/events`, `/api/shows`)

### 3.1 Search & Filter Events
- **Endpoint:** `GET /api/events`
- **Auth:** Public
- **Query Parameters:**
  - `q` (string): Full-text search on title, description, artist, genre (Postgres `tsvector` + GIN)
  - `genre` (string): e.g. "Rock", "Classical", "Tech", "Theater"
  - `city` (string): e.g. "Bengaluru", "Mumbai", "Delhi"
  - `venueId` (number): Filter by venue
  - `page` (number, default: 1)
  - `limit` (number, default: 10)
  - `sortBy` (string): `date_asc`, `date_desc`, `price_asc`, `price_desc`, `popularity`
- **Response (`200 OK`):**
```json
{
  "success": true,
  "data": {
    "events": [
      {
        "id": 1,
        "title": "Coldplay Music of the Spheres",
        "description": "Live stadium performance with immersive visuals",
        "artist": "Coldplay",
        "genre": "Rock",
        "durationMinutes": 180,
        "venue": {
          "id": 1,
          "name": "Kanteerava Stadium",
          "city": "Bengaluru"
        },
        "nextShow": {
          "id": 10,
          "startTime": "2026-11-20T19:00:00Z",
          "basePrice": 3500.00,
          "currentPrice": 4200.00,
          "availableSeats": 420,
          "totalSeats": 500
        }
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 10,
      "total": 24,
      "totalPages": 3
    }
  }
}
```

### 3.2 Get Event Details
- **Endpoint:** `GET /api/events/:id`
- **Auth:** Public
- **Response (`200 OK`):** Returns event, venue details, and upcoming show schedules.

### 3.3 Get Show Seat Layout with Dynamic Pricing
- **Endpoint:** `GET /api/shows/:id/seats`
- **Auth:** Public / Authenticated
- **Description:** Returns the complete seat grid, occupancy status (`AVAILABLE`, `HELD`, `BOOKED`), section names, and computed current dynamic price.
- **Response (`200 OK`):**
```json
{
  "success": true,
  "data": {
    "showId": 10,
    "eventTitle": "Coldplay Music of the Spheres",
    "venueName": "Kanteerava Stadium",
    "startTime": "2026-11-20T19:00:00Z",
    "pricing": {
      "basePrice": 3500.00,
      "currentDynamicPrice": 4200.00,
      "minPrice": 3000.00,
      "maxPrice": 7500.00,
      "demandTier": "HIGH",
      "occupancyRate": 0.84
    },
    "seats": [
      {
        "showSeatId": 1001,
        "seatId": 45,
        "section": "VIP",
        "rowNumber": "A",
        "seatNumber": 12,
        "status": "AVAILABLE",
        "price": 5040.00
      },
      {
        "showSeatId": 1002,
        "seatId": 46,
        "section": "VIP",
        "rowNumber": "A",
        "seatNumber": 13,
        "status": "HELD",
        "price": 5040.00,
        "holdExpiresAt": "2026-10-19T10:15:00.000Z"
      }
    ]
  }
}
```

---

## 4. Bookings & Transactions (`/api/bookings`)

### 4.1 Create Booking / Hold Seats
- **Endpoint:** `POST /api/bookings`
- **Auth:** Authenticated (`customer`)
- **Description:** Atomically verifies seat availability, locks rows with `SELECT ... FOR UPDATE`, validates prices, issues hold or confirmed booking with simulated payment.
- **Request Body:**
```json
{
  "showId": 10,
  "seatIds": [45, 46],
  "simulatePayment": {
    "method": "CREDIT_CARD",
    "shouldSucceed": true
  }
}
```
- **Response (`201 Created`):**
```json
{
  "success": true,
  "data": {
    "bookingId": 501,
    "bookingReference": "BK-20261019-98A1",
    "showId": 10,
    "eventTitle": "Coldplay Music of the Spheres",
    "totalAmount": 8400.00,
    "status": "CONFIRMED",
    "seats": [
      { "seatId": 45, "section": "VIP", "row": "A", "number": 12, "price": 4200.00 },
      { "seatId": 46, "section": "VIP", "row": "A", "number": 13, "price": 4200.00 }
    ],
    "payment": {
      "transactionId": "TXN-SIM-78912",
      "status": "SUCCESS",
      "amount": 8400.00
    },
    "createdAt": "2026-10-19T10:10:00.000Z"
  },
  "message": "Seats successfully booked"
}
```
- **Failure Responses:**
  - `409 Conflict`: `{ "code": "SEATS_UNAVAILABLE", "message": "Seats already held or booked" }`
  - `400 Bad Request`: `{ "code": "SHOW_EXPIRED", "message": "Cannot book seats for past shows" }`

### 4.2 List User Bookings
- **Endpoint:** `GET /api/bookings`
- **Auth:** Authenticated (`customer`)
- **Response (`200 OK`):** Returns all bookings made by the logged-in customer.

### 4.3 Cancel Booking
- **Endpoint:** `POST /api/bookings/:id/cancel`
- **Auth:** Authenticated (`customer` - owner only; `admin`)
- **Description:** Cancels booking, releases seats, creates refund record, and triggers waitlist promotion pipeline.
- **Response (`200 OK`):**
```json
{
  "success": true,
  "data": {
    "bookingId": 501,
    "status": "CANCELLED",
    "refundAmount": 8400.00,
    "waitlistPromotedCount": 1
  },
  "message": "Booking cancelled successfully. Seats made available to next waitlist entrant."
}
```

---

## 5. Waitlist Endpoints (`/api/shows/:id/waitlist`, `/api/waitlist`)

### 5.1 Join Waitlist
- **Endpoint:** `POST /api/shows/:id/waitlist`
- **Auth:** Authenticated (`customer`)
- **Request Body:**
```json
{
  "requestedQuantity": 2
}
```
- **Response (`201 Created`):**
```json
{
  "success": true,
  "data": {
    "waitlistId": 12,
    "showId": 10,
    "position": 3,
    "requestedQuantity": 2,
    "status": "WAITING",
    "joinedAt": "2026-10-19T10:12:00.000Z"
  },
  "message": "Successfully joined waitlist at position #3"
}
```

### 5.2 Get User Waitlist Entries
- **Endpoint:** `GET /api/waitlist`
- **Auth:** Authenticated (`customer`)
- **Response (`200 OK`):** Returns current user's waitlist positions and promotion status (with countdown timer if `PROMOTED`).

---

## 6. Behavioral Tracking (`/api/tracking` -> MongoDB)

### 6.1 Log Behavioral Event
- **Endpoint:** `POST /api/tracking`
- **Auth:** Public / Authenticated (non-blocking)
- **Request Body Variants:**

**Search tracking:**
```json
{
  "eventType": "search",
  "data": {
    "query": "Coldplay",
    "genre": "Rock",
    "resultCount": 3
  }
}
```

**Event view tracking:**
```json
{
  "eventType": "view",
  "data": {
    "showId": 10,
    "eventId": 1,
    "venueId": 1,
    "source": "recommendation"
  }
}
```

**Abandoned checkout tracking:**
```json
{
  "eventType": "abandoned_checkout",
  "data": {
    "showId": 10,
    "eventId": 1,
    "seatIds": [45, 46],
    "stepReached": "hold_initiated"
  }
}
```
- **Response (`202 Accepted`):**
```json
{
  "success": true,
  "message": "Event buffered"
}
```

---

## 7. Manager Endpoints (`/api/manager/**`)

- **Auth:** Authenticated (`manager`, `admin`)
- Role Guard: Managers can only read and mutate events/shows/pricing rules belonging to their assigned venues.

### 7.1 Create Event
- **Endpoint:** `POST /api/manager/events`
- **Request Body:** Event details, description, venueId, shows array.

### 7.2 Configure Dynamic Pricing Rules
- **Endpoint:** `PATCH /api/manager/pricing-rules/:id`
- **Request Body:**
```json
{
  "minPrice": 2500.00,
  "maxPrice": 8000.00,
  "demandMultiplier": 1.25,
  "viewWeight": 0.05,
  "searchWeight": 0.10,
  "abandonWeight": 0.08
}
```

### 7.3 Manager Analytics Dashboard
- **Endpoint:** `GET /api/analytics/manager`
- **Query Params:** `venueId`, `timeRange` (e.g. `7d`, `30d`)
- **Response (`200 OK`):** Show occupancy percentages, dynamic pricing yield, revenue by show, waitlist conversion rates.

---

## 8. Admin Oversight Endpoints (`/api/analytics/admin`, `/api/admin/**`)

- **Auth:** Authenticated (`admin` only)
- System-wide occupancy views, user management, audit logs, and trigger execution status.

---

## 9. Error Codes Reference

| HTTP Status | Error Code | Description |
| :--- | :--- | :--- |
| 400 | `VALIDATION_ERROR` | Request payload failed Zod schema parsing |
| 401 | `UNAUTHORIZED` | Missing, expired, or invalid JWT token |
| 403 | `FORBIDDEN` | Role insufficient or resource not owned by manager |
| 404 | `NOT_FOUND` | Event, show, seat, or booking does not exist |
| 409 | `SEAT_ALREADY_BOOKED` | Concurrent lock failure or seat already occupied |
| 409 | `WAITLIST_ALREADY_JOINED` | User already in waitlist for this show |
| 422 | `INVALID_OPERATION` | Show already started or invalid status transition |
| 500 | `INTERNAL_SERVER_ERROR` | Unhandled database or server exception |
