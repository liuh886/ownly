-- ============================================================================
-- Ownly Calendar Feed Service: converge the production table to the hashed
-- bearer-token schema without exposing all calendar rows to anonymous clients.
--
-- Existing production used feed_token UUID + calendar_name + auth.users FK.
-- The web client uses a local Ownly user identifier and a SHA-256 token hash.
-- This migration preserves existing subscriptions by hashing legacy feed_token
-- values before removing the raw token column.
-- ============================================================================

-- Create the canonical table for fresh environments.
create table if not exists public.ownly_calendar_feeds (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  trip_id text not null,
  token_hash text,
  ics_content text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Existing production had token data in feed_token. Add token_hash first, then
-- backfill with SHA-256 so already-issued subscription URLs remain valid.
alter table public.ownly_calendar_feeds
  add column if not exists token_hash text;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'ownly_calendar_feeds'
      and column_name = 'feed_token'
  ) then
    update public.ownly_calendar_feeds
    set token_hash = encode(extensions.digest(feed_token::text, 'sha256'), 'hex')
    where token_hash is null
      and feed_token is not null;
  end if;
end
$$;

-- The current web application is local-first and does not use auth.users as
-- its user authority, so remove legacy FKs before converting user_id to text.
do $$
declare
  fk record;
begin
  for fk in
    select c.conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'ownly_calendar_feeds'
      and c.contype = 'f'
  loop
    execute format(
      'alter table public.ownly_calendar_feeds drop constraint %I',
      fk.conname
    );
  end loop;
end
$$;

alter table public.ownly_calendar_feeds
  alter column user_id type text using user_id::text;

-- Abort rather than silently producing an unusable table if a legacy row could
-- not be migrated to a hashed bearer token.
do $$
begin
  if exists (
    select 1 from public.ownly_calendar_feeds where token_hash is null
  ) then
    raise exception 'ownly_calendar_feeds contains rows without token_hash';
  end if;
end
$$;

alter table public.ownly_calendar_feeds
  alter column token_hash set not null;

-- Rotation creates a new token for the same trip. The old production unique
-- (user_id, trip_id) constraint prevents that, so token_hash is the sole upsert
-- conflict key.
alter table public.ownly_calendar_feeds
  drop constraint if exists ownly_calendar_feeds_user_id_trip_id_key;

-- Remove legacy plaintext token/display columns after the hash backfill.
alter table public.ownly_calendar_feeds
  drop column if exists feed_token,
  drop column if exists calendar_name;

-- PostgREST upsert explicitly targets token_hash via ?on_conflict=token_hash.
do $$
begin
  if not exists (
    select 1
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'ownly_calendar_feeds'
      and c.contype = 'u'
      and c.conname = 'ownly_calendar_feeds_token_hash_key'
  ) then
    alter table public.ownly_calendar_feeds
      add constraint ownly_calendar_feeds_token_hash_key unique (token_hash);
  end if;
end
$$;

create index if not exists idx_ownly_calendar_feeds_user_trip
  on public.ownly_calendar_feeds (user_id, trip_id);

-- Tight input bounds. token_hash is a lower-case SHA-256 hex digest.
alter table public.ownly_calendar_feeds
  drop constraint if exists ownly_calendar_feeds_token_hash_format_check,
  drop constraint if exists ownly_calendar_feeds_user_id_length_check;

alter table public.ownly_calendar_feeds
  add constraint ownly_calendar_feeds_token_hash_format_check
    check (token_hash ~ '^[0-9a-f]{64}$'),
  add constraint ownly_calendar_feeds_user_id_length_check
    check (char_length(user_id) between 1 and 200);

alter table public.ownly_calendar_feeds enable row level security;

-- Data API grants and RLS are separate. Anonymous clients need only the three
-- operations used by the current local-first adapter; DELETE stays unavailable.
revoke all on table public.ownly_calendar_feeds from anon, authenticated;
grant select, insert, update on table public.ownly_calendar_feeds to anon;
grant all on table public.ownly_calendar_feeds to service_role;

-- Remove previous/broad policies if this migration is re-applied to an
-- environment that already received an earlier iteration.
drop policy if exists "Users can manage own calendar feeds" on public.ownly_calendar_feeds;
drop policy if exists "Public edge can read enabled calendar feeds" on public.ownly_calendar_feeds;
drop policy if exists "Anon can insert calendar feeds" on public.ownly_calendar_feeds;
drop policy if exists "Anon can update calendar feeds" on public.ownly_calendar_feeds;
drop policy if exists "Anon can read calendar feed by capability" on public.ownly_calendar_feeds;
drop policy if exists "Anon can insert calendar feed by capability" on public.ownly_calendar_feeds;
drop policy if exists "Anon can update calendar feed by capability" on public.ownly_calendar_feeds;

-- The token hash is a 256-bit capability. The client must present the same hash
-- in x-ownly-feed-hash. This prevents anonymous enumeration or cross-feed edits
-- while retaining the current no-login web flow.
create policy "Anon can read calendar feed by capability"
  on public.ownly_calendar_feeds
  for select
  to anon
  using (
    token_hash = coalesce(
      current_setting('request.headers', true)::jsonb ->> 'x-ownly-feed-hash',
      ''
    )
  );

create policy "Anon can insert calendar feed by capability"
  on public.ownly_calendar_feeds
  for insert
  to anon
  with check (
    token_hash = coalesce(
      current_setting('request.headers', true)::jsonb ->> 'x-ownly-feed-hash',
      ''
    )
  );

create policy "Anon can update calendar feed by capability"
  on public.ownly_calendar_feeds
  for update
  to anon
  using (
    token_hash = coalesce(
      current_setting('request.headers', true)::jsonb ->> 'x-ownly-feed-hash',
      ''
    )
  )
  with check (
    token_hash = coalesce(
      current_setting('request.headers', true)::jsonb ->> 'x-ownly-feed-hash',
      ''
    )
  );

create or replace function public.handle_ownly_calendar_feeds_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_calendar_feeds_updated_at on public.ownly_calendar_feeds;
drop trigger if exists set_ownly_calendar_feeds_updated_at on public.ownly_calendar_feeds;
create trigger set_ownly_calendar_feeds_updated_at
  before update on public.ownly_calendar_feeds
  for each row
  execute function public.handle_ownly_calendar_feeds_updated_at();
