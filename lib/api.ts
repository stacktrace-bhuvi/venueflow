/**
 * VenueFlow API client (Person 2 / frontend).
 *
 * Every backend route answers with the same envelope:
 *   success -> { success: true,  data: {...}, message?: string }
 *   failure -> { success: false, error: { code, message, details? } }
 *
 * apiFetch unwraps `data` for you and throws an ApiError carrying the
 * backend's `code` so UI can branch on it (e.g. SEATS_UNAVAILABLE).
 *
 * Auth is a httpOnly cookie (`venueflow_token`) set by /api/auth/login.
 * JavaScript cannot read it by design, so we always send credentials and
 * ask /api/auth/me who we are.
 */

export class ApiError extends Error {
  code: string;
  status: number;
  details?: unknown;

  constructor(message: string, code: string, status: number, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

type Options = {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  /** Next.js cache hint; defaults to no-store so data is always fresh. */
  cache?: RequestCache;
  signal?: AbortSignal;
};

export async function apiFetch<T = any>(path: string, options: Options = {}): Promise<T> {
  const { method = 'GET', body, cache = 'no-store', signal } = options;

  const res = await fetch(path.startsWith('/api') ? path : `/api${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'include', // send the httpOnly auth cookie
    cache,
    signal,
  });

  let payload: any = null;
  try {
    payload = await res.json();
  } catch {
    throw new ApiError('Server returned a non-JSON response', 'BAD_RESPONSE', res.status);
  }

  if (!res.ok || payload?.success === false) {
    const err = payload?.error ?? {};
    throw new ApiError(
      err.message || `Request failed with status ${res.status}`,
      err.code || 'UNKNOWN_ERROR',
      res.status,
      err.details
    );
  }

  return payload.data as T;
}

/* ------------------------------------------------------------------
   Behavioural tracking -> MongoDB.

   This is what feeds the demand score behind dynamic pricing. If the UI
   never calls it, demand is always zero and prices never move, so fire
   it on search, on opening a show, and on abandoning a checkout.
   Deliberately fire-and-forget: tracking must never break a user flow.
------------------------------------------------------------------- */
export type TrackEvent =
  | { eventType: 'search'; data: { query?: string; genre?: string; city?: string; resultCount?: number } }
  | { eventType: 'view'; data: { showId?: number; eventId?: number; venueId?: number; source?: string } }
  | {
      eventType: 'abandoned_checkout';
      data: { showId?: number; eventId?: number; seatIds?: number[]; stepReached?: string };
    };

export function track(event: TrackEvent): void {
  try {
    void fetch('/api/tracking', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
      credentials: 'include',
      keepalive: true, // still sends if the page is unloading
    }).catch(() => {});
  } catch {
    /* never surface tracking failures to the user */
  }
}

/* ------------------------- shared types ------------------------- */

export type Role = 'customer' | 'manager' | 'admin';

export type User = {
  id: number;
  email: string;
  fullName: string;
  role: Role;
  phone?: string | null;
  createdAt?: string;
};

/** /api/auth/login returns `name`; /api/auth/me returns `fullName`. Normalise. */
export function normaliseUser(raw: any): User {
  return {
    id: raw.id,
    email: raw.email,
    fullName: raw.fullName ?? raw.name ?? raw.email,
    role: raw.role,
    phone: raw.phone ?? null,
    createdAt: raw.createdAt,
  };
}

export type VenueLite = { id: number; name: string; city: string };

export type NextShow = {
  id: number;
  startTime: string;
  endTime: string;
  basePrice: string | number;
  status: string;
  venue: VenueLite;
} | null;

export type EventCard = {
  id: number;
  title: string;
  description: string | null;
  artist: string | null;
  genre: string | null;
  durationMinutes: number | null;
  posterUrl: string | null;
  createdAt: string;
  nextShow: NextShow;
};

export type Pagination = { page: number; limit: number; total: number; totalPages: number };

export type SeatStatus = 'AVAILABLE' | 'HELD' | 'BOOKED';

export type Seat = {
  showSeatId: number;
  seatId: number;
  sectionId: number;
  section: string;
  rowNumber: string;
  seatNumber: number;
  isAccessible: boolean;
  status: SeatStatus;
  holdExpiresAt: string | null;
  price: number;
};

export type ShowSeats = {
  showId: number;
  eventTitle: string;
  venueName: string;
  startTime: string;
  endTime: string;
  status: string;
  pricing: {
    basePrice: number;
    currentDynamicPrice: number;
    minPrice: number;
    maxPrice: number;
    occupancyRate: number;
    demandTier: 'NORMAL' | 'HIGH' | 'VERY_HIGH';
  };
  stats: { totalSeats: number; availableSeats: number; heldSeats: number; bookedSeats: number };
  seats: Seat[];
};

/** Rupee formatter used across the app. */
export const inr = (n: number | string) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(Number(n));
