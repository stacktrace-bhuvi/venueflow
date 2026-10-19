import { MongoClient, Db, Collection } from 'mongodb';

/**
 * MongoDB Client for VenueFlow behavioral tracking.
 * Used exclusively for high-volume, schema-flexible behavioral analytics
 * (searches, view activity, abandoned checkout flows) feeding dynamic pricing.
 */

declare global {
  // eslint-disable-next-line no-var
  var __mongoClientPromise: Promise<MongoClient> | undefined;
}

const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/venueflow';
const dbName = process.env.MONGODB_DB_NAME || 'venueflow';

let client: MongoClient;
let clientPromise: Promise<MongoClient>;

if (process.env.NODE_ENV === 'development') {
  if (!global.__mongoClientPromise) {
    client = new MongoClient(uri);
    global.__mongoClientPromise = client.connect();
  }
  clientPromise = global.__mongoClientPromise;
} else {
  client = new MongoClient(uri);
  clientPromise = client.connect();
}

/**
 * Obtain connected MongoDB Database instance.
 */
export async function getMongoDb(): Promise<Db> {
  const connectedClient = await clientPromise;
  return connectedClient.db(dbName);
}

// ----------------------------------------------------
// TypeScript interfaces for Behavioral Events
// ----------------------------------------------------

export interface SearchEvent {
  query?: string;
  genre?: string;
  city?: string;
  minPrice?: number;
  maxPrice?: number;
  resultCount: number;
  userId?: string | null;
  timestamp: Date;
  ip?: string;
  userAgent?: string;
}

export interface EventView {
  showId: number;
  eventId: number;
  venueId?: number;
  userId?: string | null;
  source?: string;
  timestamp: Date;
}

export interface AbandonedCheckout {
  showId: number;
  eventId: number;
  seatIds: number[];
  seatCount: number;
  userId?: string | null;
  stepReached: 'seat_selection' | 'hold_initiated' | 'payment_form';
  timestamp: Date;
}

/**
 * Direct collection helpers
 */
export async function getSearchEventsCollection(): Promise<Collection<SearchEvent>> {
  const db = await getMongoDb();
  return db.collection<SearchEvent>('search_events');
}

export async function getEventViewsCollection(): Promise<Collection<EventView>> {
  const db = await getMongoDb();
  return db.collection<EventView>('event_views');
}

export async function getAbandonedCheckoutsCollection(): Promise<Collection<AbandonedCheckout>> {
  const db = await getMongoDb();
  return db.collection<AbandonedCheckout>('abandoned_checkouts');
}

/**
 * Test MongoDB connectivity and return ping status.
 */
export async function testMongoConnection(): Promise<{
  success: boolean;
  message: string;
  dbName?: string;
}> {
  try {
    const db = await getMongoDb();
    const pingResult = await db.command({ ping: 1 });
    return {
      success: pingResult.ok === 1,
      message: 'MongoDB connection successful',
      dbName: db.databaseName,
    };
  } catch (err: any) {
    return {
      success: false,
      message: `MongoDB connection failed: ${err.message}`,
    };
  }
}
