import dotenv from 'dotenv';
dotenv.config();

import { setupMongoIndexes } from '../db/mongo/setup';
import { getEventViewsCollection, getSearchEventsCollection, getAbandonedCheckoutsCollection } from '../lib/db/mongo';

async function main() {
  console.log('--- Initializing VenueFlow MongoDB Behavioral Store ---');
  try {
    await setupMongoIndexes();

    const searchCol = await getSearchEventsCollection();
    const viewsCol = await getEventViewsCollection();
    const abandonedCol = await getAbandonedCheckoutsCollection();

    const existingViews = await viewsCol.countDocuments();
    if (existingViews === 0) {
      console.log('Seeding baseline behavioral tracking events...');
      const now = new Date();

      // Sample view events simulating high interest for Show #1 (Coldplay)
      const sampleViews = Array.from({ length: 45 }).map((_, i) => ({
        showId: 1,
        eventId: 1,
        venueId: 1,
        userId: i % 2 === 0 ? `user_${i}` : null,
        source: i % 3 === 0 ? 'search' : 'direct',
        timestamp: new Date(now.getTime() - Math.floor(Math.random() * 3600000)), // within last hour
      }));
      await viewsCol.insertMany(sampleViews);

      // Sample abandoned checkouts (high demand signal)
      const sampleAbandoned = Array.from({ length: 8 }).map((_, i) => ({
        showId: 1,
        eventId: 1,
        seatIds: [10 + i, 11 + i],
        seatCount: 2,
        userId: `user_abandon_${i}`,
        stepReached: 'hold_initiated' as const,
        timestamp: new Date(now.getTime() - Math.floor(Math.random() * 1800000)),
      }));
      await abandonedCol.insertMany(sampleAbandoned);

      // Sample searches
      await searchCol.insertMany([
        { query: 'Coldplay', genre: 'Rock', resultCount: 3, timestamp: now },
        { query: 'Stadium Bengaluru', resultCount: 2, timestamp: now },
        { genre: 'Rock', city: 'Bengaluru', resultCount: 1, timestamp: now },
      ]);

      console.log('✓ Baseline behavioral data seeded into MongoDB.');
    } else {
      console.log(`MongoDB already contains ${existingViews} event views. Skipping seed.`);
    }

    console.log('MongoDB initialization complete.');
    process.exit(0);
  } catch (err: any) {
    console.error('MongoDB initialization failed:', err);
    process.exit(1);
  }
}

main();
