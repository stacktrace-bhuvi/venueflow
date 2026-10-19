import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

import { pool } from '../lib/db/pg';

async function main() {
  console.log('--- Initializing VenueFlow PostgreSQL Database ---');
  const client = await pool.connect();
  try {
    const filesToRun = [
      'db/schema.sql',
      'db/functions_triggers.sql',
      'db/views_indexes.sql',
    ];

    for (const relativePath of filesToRun) {
      const fullPath = path.join(process.cwd(), relativePath);
      if (fs.existsSync(fullPath)) {
        const sql = fs.readFileSync(fullPath, 'utf8');
        if (sql.trim().length > 0) {
          console.log(`Executing ${relativePath}...`);
          await client.query(sql);
          console.log(`✓ ${relativePath} completed.`);
        }
      }
    }

    console.log('Database initialization completed successfully.');
  } catch (err: any) {
    console.error('Database initialization failed:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
