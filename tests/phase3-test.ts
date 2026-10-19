import dotenv from 'dotenv';
dotenv.config();

import { hashPassword, verifyPassword } from '../lib/auth/password';
import { signToken, verifyToken } from '../lib/auth/jwt';
import {
  getSearchEventsCollection,
  getEventViewsCollection,
  getAbandonedCheckoutsCollection,
} from '../lib/db/mongo';

async function runPhase3Tests() {
  console.log('--- Phase 3 Verification Suite ---');

  // Test 1: Password hashing
  const rawPw = 'SuperSecret123!';
  const hashed = await hashPassword(rawPw);
  const matched = await verifyPassword(rawPw, hashed);
  const failedMismatch = await verifyPassword('WrongPw123!', hashed);

  if (matched && !failedMismatch) {
    console.log('✓ Test 1: Bcrypt password hashing & salt verification passed.');
  } else {
    throw new Error('Test 1 failed.');
  }

  // Test 2: JWT signing and role payload
  const token = signToken({
    userId: 42,
    email: 'test@example.com',
    role: 'manager',
    name: 'Test Manager',
  });
  const decoded = verifyToken(token);

  if (decoded && decoded.userId === 42 && decoded.role === 'manager') {
    console.log('✓ Test 2: JWT signing and role guard decoding passed.');
  } else {
    throw new Error('Test 2 failed.');
  }

  // Test 3: MongoDB telemetry collections write & count
  const viewsCol = await getEventViewsCollection();
  const searchCol = await getSearchEventsCollection();
  const abandonCol = await getAbandonedCheckoutsCollection();

  const testViewId = `test_${Date.now()}`;
  await viewsCol.insertOne({
    showId: 99,
    eventId: 99,
    userId: testViewId,
    timestamp: new Date(),
  });

  const found = await viewsCol.findOne({ userId: testViewId });
  if (found) {
    console.log('✓ Test 3: MongoDB telemetry write and retrieval passed.');
    await viewsCol.deleteOne({ userId: testViewId });
  } else {
    throw new Error('Test 3 failed.');
  }

  console.log('All Phase 3 foundational unit checks passed!');
  process.exit(0);
}

runPhase3Tests().catch((err) => {
  console.error('Phase 3 verification failed:', err);
  process.exit(1);
});
