import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthUser } from '@/lib/auth/middleware';
import {
  getSearchEventsCollection,
  getEventViewsCollection,
  getAbandonedCheckoutsCollection,
} from '@/lib/db/mongo';

const searchEventSchema = z.object({
  query: z.string().optional(),
  genre: z.string().optional(),
  city: z.string().optional(),
  minPrice: z.number().optional(),
  maxPrice: z.number().optional(),
  resultCount: z.number().int().default(0),
});

const viewEventSchema = z.object({
  showId: z.number().int().positive(),
  eventId: z.number().int().positive(),
  venueId: z.number().int().optional(),
  source: z.string().optional(),
});

const abandonedCheckoutSchema = z.object({
  showId: z.number().int().positive(),
  eventId: z.number().int().positive(),
  seatIds: z.array(z.number().int().positive()),
  seatCount: z.number().int().positive().optional(),
  stepReached: z.enum(['seat_selection', 'hold_initiated', 'payment_form']),
});

const trackingPayloadSchema = z.discriminatedUnion('eventType', [
  z.object({
    eventType: z.literal('search'),
    data: searchEventSchema,
  }),
  z.object({
    eventType: z.literal('view'),
    data: viewEventSchema,
  }),
  z.object({
    eventType: z.literal('abandoned_checkout'),
    data: abandonedCheckoutSchema,
  }),
]);

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parseResult = trackingPayloadSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid tracking payload structure',
            details: parseResult.error.errors,
          },
        },
        { status: 400 }
      );
    }

    const { eventType, data } = parseResult.data;
    const authUser = getAuthUser(req);
    const userId = authUser ? authUser.userId.toString() : null;
    const timestamp = new Date();

    // Route to appropriate MongoDB collection
    if (eventType === 'search') {
      const col = await getSearchEventsCollection();
      await col.insertOne({
        ...data,
        userId,
        timestamp,
        ip: req.headers.get('x-forwarded-for') || undefined,
        userAgent: req.headers.get('user-agent') || undefined,
      });
    } else if (eventType === 'view') {
      const col = await getEventViewsCollection();
      await col.insertOne({
        ...data,
        userId,
        timestamp,
      });
    } else if (eventType === 'abandoned_checkout') {
      const col = await getAbandonedCheckoutsCollection();
      await col.insertOne({
        ...data,
        seatCount: data.seatCount || data.seatIds.length,
        userId,
        timestamp,
      });
    }

    return NextResponse.json(
      {
        success: true,
        message: 'Telemetry buffered successfully',
      },
      { status: 202 }
    );
  } catch (err: any) {
    console.error('[MongoDB Tracking Error]:', err);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'TRACKING_WRITE_FAILED',
          message: err.message || 'Failed to record behavioral telemetry',
        },
      },
      { status: 500 }
    );
  }
}
