-- ============================================================================
-- Trip Share: grant anon SELECT scoped by the write capability.
--
-- PostgREST upsert (INSERT ... ON CONFLICT DO UPDATE) and any RLS policy that
-- references a column both require SELECT privilege on the table. Without it,
-- publishing and disabling both fail with 42501 "permission denied for table".
--
-- Grant SELECT, but scope it with the same capability so anonymous clients can
-- only read the row whose write_token_hash they already possess. Aliases stay
-- unenumerable (a missing/incorrect header matches no rows).
-- ============================================================================

grant select on table public.ownly_trip_shares to anon;

drop policy if exists "Anon can read trip share by write capability" on public.ownly_trip_shares;

create policy "Anon can read trip share by write capability"
  on public.ownly_trip_shares
  for select
  to anon
  using (
    write_token_hash = coalesce(
      current_setting('request.headers', true)::jsonb ->> 'x-ownly-share-write-hash',
      ''
    )
  );
