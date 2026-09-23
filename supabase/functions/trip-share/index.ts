// ============================================================================
// Supabase Edge Function: trip-share
// Serves the PRO self-contained itinerary document as TEXT at
// /trip-share/:alias.
//
// Supabase rewrites HTML responses to text/plain, so the public link renders
// through the static /s/ viewer on the Ownly web host, which fetches this
// endpoint and renders the document. CORS is open because the alias is public
// and the document is scriptless.
//
// The alias is the trip name (public by design), so lookups run server-side
// with service_role and the table has no anonymous SELECT policy.
// ============================================================================

import { createClient } from 'npm:@supabase/supabase-js@2.111.0';

const ALIAS_MAX_LENGTH = 64;
const FORBIDDEN_ALIAS_RE = /[/\\?#%\u0000-\u001f]/;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type',
};

function textResponse(body: string, status: number, extra: Record<string, string> = {}): Response {
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', ...CORS, ...extra },
  });
}

function extractAlias(req: Request): string | null {
  const url = new URL(req.url);
  const queryAlias = url.searchParams.get('alias');
  if (queryAlias !== null) return queryAlias.trim();
  const match = url.pathname.match(/trip-share\/(.+)$/);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]).trim();
  } catch {
    return null;
  }
}

function validAlias(alias: string | null): alias is string {
  return Boolean(
    alias &&
      alias.length >= 1 &&
      alias.length <= ALIAS_MAX_LENGTH &&
      !FORBIDDEN_ALIAS_RE.test(alias),
  );
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return textResponse('Method Not Allowed', 405, { Allow: 'GET, HEAD, OPTIONS' });
  }

  const alias = extractAlias(req);
  if (!validAlias(alias)) {
    return textResponse('Share link not found', 404);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!supabaseUrl || !serviceRoleKey) {
    console.error('trip-share: Supabase server credentials unavailable');
    return textResponse('Share unavailable', 500);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: record, error } = await admin
    .from('ownly_trip_shares')
    .select('alias, html_content, enabled, updated_at')
    .eq('alias', alias)
    .eq('enabled', true)
    .maybeSingle();

  if (error) {
    console.error('trip-share lookup failed', error);
    return textResponse('Share unavailable', 500);
  }

  if (!record?.enabled) {
    return textResponse('Share link not found or expired', 404, {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'X-Robots-Tag': 'noindex, nofollow',
    });
  }

  const headers = {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'public, max-age=300, stale-while-revalidate=3600',
    'X-Robots-Tag': 'noindex, nofollow',
    'Referrer-Policy': 'no-referrer',
    'X-Published-By': 'Ownly Trip Share Service',
    ...CORS,
    ETag: `W/"${alias}-${record.updated_at}"`,
  };

  if (req.method === 'HEAD') {
    return new Response(null, { status: 200, headers });
  }

  return new Response(record.html_content, { status: 200, headers });
});
