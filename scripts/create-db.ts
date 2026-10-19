import { Pool } from 'pg';

async function main() {
  const pool = new Pool({
    host: 'localhost',
    port: 5432,
    user: 'postgres',
    database: 'postgres',
  });

  try {
    const res = await pool.query("SELECT 1 FROM pg_database WHERE datname = 'venueflow'");
    if (res.rows.length === 0) {
      console.log("Creating database 'venueflow'...");
      await pool.query('CREATE DATABASE venueflow');
      console.log("Database 'venueflow' created successfully.");
    } else {
      console.log("Database 'venueflow' already exists.");
    }
  } catch (err) {
    console.error('Failed to create database:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
