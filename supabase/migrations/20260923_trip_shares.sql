-- ============================================================================
-- Ownly Trip Share Service (PRO)
-- Hosts the self-contained itinerary HTML at a stable per-trip alias URL.
-- Boundary: Planner owns travel state authority; this table only hosts a
-- read-only HTML projection. Expenses are never included in the projection.
--
-- The alias is the trip name (public and low-entropy by design), so it is NOT
-- the authorization secret: writes require the owner's high-entropy write
-- token, whose SHA-256 must match x-ownly-share-write-hash. Anonymous SELECT is
-- not granted, so aliases cannot be enumerated through the Data API; public
-- reads are served by the trip-share Edge Function with service_role.
-- ============================================================================

create table if not exists public.ownly_trip_shares (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  trip_id text not null,
  alias text not null,
  write_token_hash text not null,
  html_content text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ownly_trip_shares_alias_key unique (alias),
  constraint ownly_trip_shares_alias_format_check
    check (char_length(alias) between 1 and 64 and alias !~ '[/\\?#%]'),
  constraint ownly_trip_shares_write_hash_format_check check (write_token_hash ~ '^[0-9a-f]{64}$'),
  constraint ownly_trip_shares_user_id_length_check check (char_length(user_id) between 1 and 200)
);

create index if not exists idx_ownly_trip_shares_alias on public.ownly_trip_shares (alias);
create index if not exists idx_ownly_trip_shares_user_trip on public.ownly_trip_shares (user_id, trip_id);

alter table public.ownly_trip_shares enable row level security;

-- Data API grants: the local-first client only inserts/updates its own row by
-- write capability. No DELETE, and no SELECT for anonymous clients.
revoke all on table public.ownly_trip_shares from anon, authenticated;
grant insert, update on table public.ownly_trip_shares to anon;
grant all on table public.ownly_trip_shares to service_role;

drop policy if exists "Anon can insert trip share by write capability" on public.ownly_trip_shares;
drop policy if exists "Anon can update trip share by write capability" on public.ownly_trip_shares;

create policy "Anon can insert trip share by write capability"
  on public.ownly_trip_shares
  for insert
  to anon
  with check (
    write_token_hash = coalesce(
      current_setting('request.headers', true)::jsonb ->> 'x-ownly-share-write-hash',
      ''
    )
  );

create policy "Anon can update trip share by write capability"
  on public.ownly_trip_shares
  for update
  to anon
  using (
    write_token_hash = coalesce(
      current_setting('request.headers', true)::jsonb ->> 'x-ownly-share-write-hash',
      ''
    )
  )
  with check (
    write_token_hash = coalesce(
      current_setting('request.headers', true)::jsonb ->> 'x-ownly-share-write-hash',
      ''
    )
  );

create or replace function public.handle_ownly_trip_shares_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_ownly_trip_shares_updated_at on public.ownly_trip_shares;
create trigger set_ownly_trip_shares_updated_at
  before update on public.ownly_trip_shares
  for each row
  execute function public.handle_ownly_trip_shares_updated_at();
