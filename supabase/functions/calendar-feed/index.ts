// ============================================================================
// Supabase Edge Function: calendar-feed
// Serves public RFC 5545 ICS projections to Google/Apple/Outlook Calendar subscribers.
// URL pattern: GET /calendar-feed/:token.ics or /f/:token.ics
// ============================================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

async function sha256Hex(str: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(str.trim());
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

serve(async (req: Request) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const url = new URL(req.url);
  // Extract token from pathname, e.g. /functions/v1/calendar-feed/4Fz8kQm...x2.ics or /f/4Fz8kQm...x2.ics
  const pathname = url.pathname;
  const match = pathname.match(/(?:calendar-feed|f)\/([a-zA-Z0-9_-]+)(?:\.ics)?$/);
  const token = match ? match[1] : null;

  if (!token) {
    return new Response('Calendar feed token missing or invalid', {
      status: 400,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  const tokenHash = await sha256Hex(token);
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

  const supabase = createClient(supabaseUrl, supabaseAnonKey);

  const { data: record, error } = await supabase
    .from('calendar_feeds')
    .select('trip_id, ics_content, enabled, updated_at')
    .eq('token_hash', tokenHash)
    .eq('enabled', true)
    .maybeSingle();

  if (error || !record || !record.enabled) {
    return new Response('Calendar feed not found or expired', {
      status: 404,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });
  }

  return new Response(record.ics_content, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `inline; filename="trip-${record.trip_id}.ics"`,
      'Cache-Control': 'public, max-age=1800, stale-while-revalidate=3600',
      'X-Robots-Tag': 'noindex, nofollow',
      'X-Published-By': 'Ownly Calendar Feed Service',
      ETag: `W/"${tokenHash.substring(0, 16)}-${record.updated_at}"`,
    },
  });
});
