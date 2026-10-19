import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';

/**
 * PostgreSQL Connection Pool for VenueFlow.
 * We use the native 'pg' library with raw parameterized SQL (no ORM)
 * to ensure all queries, locks, triggers, and transactions are visible
 * for academic evaluation and fine-grained control.
 */

declare global {
  // eslint-disable-next-line no-var
  var __pgPool: Pool | undefined;
}

function createPool(): Pool {
  const connectionString = process.env.DATABASE_URL;

  const ssl =
    process.env.PGSSL === 'true'
      ? { rejectUnauthorized: false }
      : false;

  if (connectionString) {
    return new Pool({
      connectionString,
      ssl,
      max: 20, // Max concurrent connections
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });
  }

  return new Pool({
    host: process.env.PGHOST || 'localhost',
    port: parseInt(process.env.PGPORT || '5432', 10),
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD || 'postgres',
    database: process.env.PGDATABASE || 'venueflow',
    ssl,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });
}

// In Next.js development, global preserves pool across hot-module reloads
export const pool: Pool = global.__pgPool || createPool();

if (process.env.NODE_ENV !== 'production') {
  global.__pgPool = pool;
}

pool.on('error', (err) => {
  console.error('[PostgreSQL Pool Error]: Unexpected error on idle client', err);
});

/**
 * Execute a parameterized query using a client from the pool.
 * Automatically handles checkout and release.
 */
export async function query<R extends QueryResultRow = any, I extends any[] = any[]>(
  text: string,
  params?: I
): Promise<QueryResult<R>> {
  const start = Date.now();
  try {
    const res = await pool.query<R>(text, params);
    const duration = Date.now() - start;
    if (process.env.NODE_ENV === 'development' && duration > 100) {
      console.log(`[PG Slow Query] (${duration}ms): ${text.replace(/\s+/g, ' ').slice(0, 100)}...`);
    }
    return res;
  } catch (error) {
    console.error(`[PG Query Failed]: ${text.replace(/\s+/g, ' ').slice(0, 120)}`, error);
    throw error;
  }
}

/**
 * Acquire a dedicated client for transactions (e.g. BEGIN / COMMIT / ROLLBACK).
 * Caller MUST call client.release() when finished.
 */
export async function getClient(): Promise<PoolClient> {
  const client = await pool.connect();
  return client;
}

/**
 * Helper to run a callback inside a PostgreSQL transaction.
 * Automatically issues BEGIN, runs callback, and issues COMMIT or ROLLBACK.
 */
export async function withTransaction<T>(
  callback: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Test database connectivity and return server time.
 */
export async function testPgConnection(): Promise<{
  success: boolean;
  message: string;
  serverTime?: string;
  version?: string;
}> {
  try {
    const res = await pool.query('SELECT NOW() as now, version() as version;');
    return {
      success: true,
      message: 'PostgreSQL connection successful',
      serverTime: res.rows[0].now,
      version: res.rows[0].version,
    };
  } catch (err: any) {
    return {
      success: false,
      message: `PostgreSQL connection failed: ${err.message}`,
    };
  }
}
