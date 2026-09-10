// ============================================================================
// Supabase Edge Function: calendar-feed
// Serves public RFC 5545 ICS projections to Google/Apple/Outlook Calendar.
//
// Canonical URL: /calendar-feed/:token.ics (or reverse-proxied /f/:token.ics)
// Legacy URL:    /calendar-feed?token=<uuid>
//
// The raw bearer token is never stored in Postgres. This function hashes the
// presented token and performs the lookup server-side with service_role so the
// calendar table itself does not need broad anonymous SELECT access.
// ============================================================================

import { createClient } from 'npm:@supabase/supabase-js@2.111.0';

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value.trim());
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function extractToken(req: Request): string | null {
  const url = new URL(req.url);
  const queryToken = url.searchParams.get('token')?.trim();
  if (queryToken) return queryToken;

  const match = url.pathname.match(/(?:calendar-feed|f)\/([a-zA-Z0-9_-]+)(?:\.ics)?$/);
  return match?.[1]?.trim() || null;
}

function validBearerToken(token: string | null): token is string {
  // Covers current 32-char CSPRNG tokens and legacy UUID tokens while rejecting
  // path/control characters. Keep an upper bound to avoid abusive hashing input.
  return Boolean(token && token.length >= 20 && token.length <= 128 && /^[a-zA-Z0-9_-]+$/.test(token));
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return new Response('Method Not Allowed', {
      status: 405,
      headers: { Allow: 'GET, HEAD' },
    });
  }

  const token = extractToken(req);
  if (!validBearerToken(token)) {
    return new Response('Calendar feed not found', {
      status: 404,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!supabaseUrl || !serviceRoleKey) {
    console.error('calendar-feed: Supabase server credentials unavailable');
    return new Response('Calendar unavailable', { status: 500 });
  }

  const tokenHash = await sha256Hex(token);
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: record, error } = await admin
    .from('ownly_calendar_feeds')
    .select('trip_id, ics_content, enabled, updated_at')
    .eq('token_hash', tokenHash)
    .eq('enabled', true)
    .maybeSingle();

  if (error) {
    console.error('calendar-feed lookup failed', error);
    return new Response('Calendar unavailable', { status: 500 });
  }

  if (!record?.enabled) {
    return new Response('Calendar feed not found or expired', {
      status: 404,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });
  }

  const safeName = /^[A-Za-z0-9_-]+$/.test(record.trip_id) ? `trip-${record.trip_id}` : 'ownly';
  const headers = {
    'Content-Type': 'text/calendar; charset=utf-8',
    'Content-Disposition': `inline; filename="${safeName}.ics"`,
    'Cache-Control': 'public, max-age=1800, stale-while-revalidate=3600',
    'X-Content-Type-Options': 'nosniff',
    'X-Robots-Tag': 'noindex, nofollow',
    'X-Published-By': 'Ownly Calendar Feed Service',
    ETag: `W/"${tokenHash.substring(0, 16)}-${record.updated_at}"`,
  };

  if (req.method === 'HEAD') {
    return new Response(null, { status: 200, headers });
  }

  return new Response(record.ics_content, { status: 200, headers });
});
