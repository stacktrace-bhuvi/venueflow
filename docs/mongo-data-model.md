# VenueFlow — MongoDB Behavioral Data Model & Aggregation Pipeline

> **Course Requirement:** NoSQL (MongoDB) data model documentation, indexing rationale, TTL policies, and aggregation pipeline for demand-driven analytics.

---

## 1. MongoDB Behavioral Collections

VenueFlow uses MongoDB exclusively for telemetry and high-velocity behavioral events that would impose prohibitive write-amplification and index-maintenance overhead on the relational PostgreSQL database:

```text
MongoDB: venueflow
├── search_events         (Telemetry for event discovery and user search queries)
├── event_views           (Telemetry for page visits and show interest)
└── abandoned_checkouts   (Telemetry for checkout drop-offs indicating purchase friction)
```

---

## 2. Collection Schemas & Sample Documents

### 2.1 `search_events` Collection
Captures user search queries, applied filters, and result yield.

```json
{
  "_id": { "$oid": "67140f098192a838b975a101" },
  "query": "Coldplay",
  "genre": "Rock",
  "city": "Bengaluru",
  "minPrice": 2000,
  "maxPrice": 8000,
  "resultCount": 2,
  "userId": 14,
  "timestamp": { "$date": "2026-10-19T10:15:30.000Z" },
  "ip": "192.168.1.10",
  "userAgent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
}
```

### 2.2 `event_views` Collection
High-frequency write stream logging user visits to specific show pages.

```json
{
  "_id": { "$oid": "67140f098192a838b975a102" },
  "showId": 1,
  "eventId": 1,
  "venueId": 1,
  "userId": 14,
  "source": "search_result",
  "timestamp": { "$date": "2026-10-19T10:16:02.000Z" }
}
```

### 2.3 `abandoned_checkouts` Collection
Fired when a user initiates seat selection or temporary hold but abandons before payment confirmation. This represents a strong demand signal (willingness to pay hindered by price, friction, or competition).

```json
{
  "_id": { "$oid": "67140f098192a838b975a103" },
  "showId": 1,
  "eventId": 1,
  "seatIds": [12, 13],
  "seatCount": 2,
  "userId": 14,
  "stepReached": "hold_initiated",
  "timestamp": { "$date": "2026-10-19T10:18:45.000Z" }
}
```

---

## 3. Indexing Strategy & TTL Policies

| Collection | Index Key(s) | Index Type | Purpose |
| :--- | :--- | :--- | :--- |
| `event_views` | `{ showId: 1, timestamp: -1 }` | Compound B-tree | Enables dynamic pricing queries to filter by `showId` and recent rolling time window (`$gte: now - 1h`) with zero collection scan (`COLLSCAN`). |
| `event_views` | `{ timestamp: 1 }` (expireAfterSeconds: 2592000) | **TTL Index** | Automatically purges view records older than **30 days** at the database engine level, avoiding external cron scripts. |
| `search_events` | `{ timestamp: -1 }` | B-tree | Fast sorting for discovery analytics. |
| `search_events` | `{ genre: 1, city: 1, timestamp: -1 }` | Compound B-tree | Category and regional demand trend aggregation. |
| `search_events` | `{ timestamp: 1 }` (expireAfterSeconds: 7776000) | **TTL Index** | Evicts search history after **90 days**. |
| `abandoned_checkouts` | `{ showId: 1, timestamp: -1 }` | Compound B-tree | Fast surge computation for dynamic pricing. |
| `abandoned_checkouts` | `{ timestamp: 1 }` (expireAfterSeconds: 1209600) | **TTL Index** | Evicts abandoned checkouts after **14 days**. |

---

## 4. Dynamic Pricing Demand Aggregation Pipeline

The pricing engine aggregates recent behavioral telemetry (default: past 1 hour) for a given `showId`:

```javascript
db.event_views.aggregate([
  {
    $match: {
      showId: targetShowId,
      timestamp: { $gte: new Date(Date.now() - 3600000) } // rolling 1-hour window
    }
  },
  {
    $group: {
      _id: "$showId",
      recentViews: { $sum: 1 },
      uniqueUsers: { $addToSet: "$userId" }
    }
  },
  {
    $project: {
      showId: "$_id",
      recentViews: 1,
      uniqueUserCount: { $size: "$uniqueUsers" }
    }
  }
]);
```

Simultaneously, `abandoned_checkouts` are summed:
```javascript
db.abandoned_checkouts.aggregate([
  {
    $match: {
      showId: targetShowId,
      timestamp: { $gte: new Date(Date.now() - 3600000) }
    }
  },
  {
    $group: {
      _id: "$showId",
      abandonCount: { $sum: 1 },
      totalSeatsAttempted: { $sum: "$seatCount" }
    }
  }
]);
```

These raw telemetry metrics are passed as arguments to the PostgreSQL stored function `calculate_dynamic_price(p_show_id, p_recent_views, p_recent_abandonments)` where they are combined with PostgreSQL-governed real-time physical occupancy percentages.
