import { getMongoDb } from '../../lib/db/mongo';

/**
 * Initializes MongoDB collections, compound indexes, and TTL expiration indexes.
 */
export async function setupMongoIndexes() {
  const db = await getMongoDb();

  console.log('[MongoDB] Setting up collections and indexes...');

  // 1. search_events: query index + timestamp index
  const searchCol = db.collection('search_events');
  await searchCol.createIndex({ timestamp: -1 });
  await searchCol.createIndex({ genre: 1, city: 1, timestamp: -1 });
  // TTL index: keep search events for 90 days
  await searchCol.createIndex({ timestamp: 1 }, { expireAfterSeconds: 90 * 86400 });

  // 2. event_views: compound index for fast dynamic pricing aggregation
  const viewsCol = db.collection('event_views');
  await viewsCol.createIndex({ showId: 1, timestamp: -1 });
  await viewsCol.createIndex({ eventId: 1, timestamp: -1 });
  // TTL index: keep raw views for 30 days
  await viewsCol.createIndex({ timestamp: 1 }, { expireAfterSeconds: 30 * 86400 });

  // 3. abandoned_checkouts: compound index for demand surge signals
  const abandonedCol = db.collection('abandoned_checkouts');
  await abandonedCol.createIndex({ showId: 1, timestamp: -1 });
  await abandonedCol.createIndex({ eventId: 1, timestamp: -1 });
  // TTL index: keep checkout drop-off signals for 14 days
  await abandonedCol.createIndex({ timestamp: 1 }, { expireAfterSeconds: 14 * 86400 });

  console.log('[MongoDB] Collections and indexes initialized successfully.');
}
