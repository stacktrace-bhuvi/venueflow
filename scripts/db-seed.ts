import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

import { pool } from '../lib/db/pg';

async function main() {
  console.log('--- Seeding VenueFlow PostgreSQL Database ---');
  const client = await pool.connect();
  try {
    const seedPath = path.join(process.cwd(), 'db/seed.sql');
    if (!fs.existsSync(seedPath)) {
      throw new Error('db/seed.sql not found');
    }

    const sql = fs.readFileSync(seedPath, 'utf8');
    if (sql.trim().length > 0) {
      console.log('Executing db/seed.sql...');
      await client.query(sql);
      console.log('✓ db/seed.sql executed successfully.');
    } else {
      console.log('db/seed.sql is currently empty (will be seeded in Phase 2).');
    }
  } catch (err: any) {
    console.error('Seeding failed:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
