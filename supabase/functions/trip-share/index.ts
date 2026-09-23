// ============================================================================
// Supabase Edge Function: trip-share
// Serves the PRO self-contained itinerary HTML at /trip-share/:alias.
//
// The alias is the trip name (public by design), so lookups run server-side
// with service_role and the table has no anonymous SELECT policy. The document
// is scriptless (inline styles only), so a strict CSP still renders it while
// blocking every external fetch; X-Robots-Tag keeps the link out of search
// indexes.
// ============================================================================

import { createClient } from 'npm:@supabase/supabase-js@2.111.0';

const ALIAS_MAX_LENGTH = 64;
const FORBIDDEN_ALIAS_RE = /[/\\?#%\u0000-\u001f]/;

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
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return new Response('Method Not Allowed', {
      status: 405,
      headers: { Allow: 'GET, HEAD' },
    });
  }

  const alias = extractAlias(req);
  if (!validAlias(alias)) {
    return new Response('Share link not found', {
      status: 404,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!supabaseUrl || !serviceRoleKey) {
    console.error('trip-share: Supabase server credentials unavailable');
    return new Response('Share unavailable', { status: 500 });
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
    return new Response('Share unavailable', { status: 500 });
  }

  if (!record?.enabled) {
    return new Response('Share link not found or expired', {
      status: 404,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'X-Robots-Tag': 'noindex, nofollow',
      },
    });
  }

  const headers = {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'public, max-age=300, stale-while-revalidate=3600',
    'Content-Security-Policy':
      "default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    'X-Content-Type-Options': 'nosniff',
    'X-Robots-Tag': 'noindex, nofollow',
    'Referrer-Policy': 'no-referrer',
    'X-Published-By': 'Ownly Trip Share Service',
    ETag: `W/"${alias}-${record.updated_at}"`,
  };

  if (req.method === 'HEAD') {
    return new Response(null, { status: 200, headers });
  }

  return new Response(record.html_content, { status: 200, headers });
});
