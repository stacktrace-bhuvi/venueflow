import { NextResponse } from 'next/server';
import { testPgConnection } from '@/lib/db/pg';
import { testMongoConnection } from '@/lib/db/mongo';

export const dynamic = 'force-dynamic';

export async function GET() {
  const [pgStatus, mongoStatus] = await Promise.all([
    testPgConnection(),
    testMongoConnection(),
  ]);

  const allHealthy = pgStatus.success && mongoStatus.success;

  return NextResponse.json(
    {
      status: allHealthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      databases: {
        postgres: pgStatus,
        mongo: mongoStatus,
      },
    },
    { status: allHealthy ? 200 : 503 }
  );
}
